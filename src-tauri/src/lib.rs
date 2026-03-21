#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use arboard::Clipboard;
use base64::Engine;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ffi::c_void;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager};

#[allow(non_snake_case)]
mod win {
    use std::ffi::c_void;
    pub type WPARAM = usize;
    pub type LPARAM = isize;
    pub type LRESULT = isize;
    pub type HHOOK = isize;
    pub type HINSTANCE = isize;
    pub type HWND = isize;
    pub type HANDLE = *mut c_void;

    pub const WH_KEYBOARD_LL: i32 = 13;
    pub const WM_KEYDOWN: u32 = 0x0100;
    pub const WM_KEYUP: u32 = 0x0101;
    pub const WM_SYSKEYDOWN: u32 = 0x0104;
    pub const WM_SYSKEYUP: u32 = 0x0105;
    pub const TOKEN_QUERY: u32 = 0x0008;

    #[repr(C)]
    pub struct KBDLLHOOKSTRUCT {
        pub vkCode: u32,
        pub scanCode: u32,
        pub flags: u32,
        pub time: u32,
        pub dwExtraInfo: usize,
    }

    #[repr(C)]
    pub struct MSG {
        pub hwnd: HWND,
        pub message: u32,
        pub wParam: WPARAM,
        pub lParam: LPARAM,
        pub time: u32,
        pub pt_x: i32,
        pub pt_y: i32,
    }

    #[repr(C)]
    pub struct TOKEN_ELEVATION {
        pub TokenIsElevated: u32,
    }

    extern "system" {
        pub fn SetWindowsHookExW(
            idHook: i32,
            lpfn: unsafe extern "system" fn(i32, WPARAM, LPARAM) -> LRESULT,
            hmod: HINSTANCE,
            dwThreadId: u32,
        ) -> HHOOK;
        pub fn CallNextHookEx(hhk: HHOOK, code: i32, wParam: WPARAM, lParam: LPARAM) -> LRESULT;
        pub fn UnhookWindowsHookEx(hhk: HHOOK) -> i32;
        pub fn GetMessageW(msg: *mut MSG, hwnd: HWND, min: u32, max: u32) -> i32;
        pub fn OpenProcessToken(proc_: HANDLE, access: u32, token: *mut HANDLE) -> i32;
        pub fn GetCurrentProcess() -> HANDLE;
        pub fn GetTokenInformation(
            token: HANDLE,
            class: u32,
            info: *mut c_void,
            len: u32,
            ret_len: *mut u32,
        ) -> i32;
        pub fn CloseHandle(h: HANDLE) -> i32;
        pub fn ShellExecuteW(
            hwnd: HWND,
            op: *const u16,
            file: *const u16,
            params: *const u16,
            dir: *const u16,
            show: i32,
        ) -> HINSTANCE;
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn is_elevated() -> bool {
    unsafe {
        let mut token: win::HANDLE = std::ptr::null_mut();
        if win::OpenProcessToken(win::GetCurrentProcess(), win::TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elev = win::TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut sz = 0u32;
        let ok = win::GetTokenInformation(
            token,
            20, // TokenElevation
            &mut elev as *mut _ as *mut c_void,
            std::mem::size_of::<win::TOKEN_ELEVATION>() as u32,
            &mut sz,
        );
        win::CloseHandle(token);
        ok != 0 && elev.TokenIsElevated != 0
    }
}

pub fn elevate_self() {
    let exe = std::env::current_exe().unwrap();
    let exe_w = wide(&exe.to_string_lossy());
    let runas = wide("runas");
    unsafe {
        win::ShellExecuteW(
            0,
            runas.as_ptr(),
            exe_w.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        );
    }
}

#[derive(Serialize, Deserialize, Default, Clone)]
struct Config {
    api_key: Option<String>,
    language: Option<String>,
    keybind: Option<Vec<String>>,
}

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_config_dir().unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&dir).ok();
    dir.join("config.json")
}

fn read_config(app: &tauri::AppHandle) -> Config {
    let path = config_path(app);
    if !path.exists() {
        return Config::default();
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|d| serde_json::from_str(&d).ok())
        .unwrap_or_default()
}

fn write_config(app: &tauri::AppHandle, config: &Config) -> Result<(), String> {
    let json = serde_json::to_string(config).map_err(|e| e.to_string())?;
    fs::write(config_path(app), json).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let mut c = read_config(&app);
    c.api_key = Some(key);
    write_config(&app, &c)
}

#[tauri::command]
fn load_api_key(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(read_config(&app).api_key)
}

#[tauri::command]
fn save_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    let mut c = read_config(&app);
    c.language = if language.is_empty() { None } else { Some(language) };
    write_config(&app, &c)
}

#[tauri::command]
fn load_language(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(read_config(&app).language)
}

#[tauri::command]
fn save_keybind(app: tauri::AppHandle, keys: Vec<String>) -> Result<(), String> {
    let mut c = read_config(&app);
    c.keybind = Some(keys.clone());
    write_config(&app, &c)?;
    update_hook_keys(keys);
    Ok(())
}

#[tauri::command]
fn load_keybind(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    Ok(read_config(&app)
        .keybind
        .unwrap_or_else(|| vec!["Control".into(), "Shift".into()]))
}

#[tauri::command]
fn set_hook_enabled(enabled: bool) -> Result<(), String> {
    if let Ok(mut g) = HOOK.lock() {
        if let Some(ref mut s) = *g {
            s.enabled = enabled;
        }
    }
    Ok(())
}

#[tauri::command]
async fn transcribe(app: tauri::AppHandle, audio_base64: String) -> Result<String, String> {
    let config = read_config(&app);
    let api_key = config.api_key.ok_or("No API key configured")?;

    let audio_data = base64::engine::general_purpose::STANDARD
        .decode(&audio_base64)
        .map_err(|e| e.to_string())?;

    let part = multipart::Part::bytes(audio_data)
        .file_name("audio.webm")
        .mime_str("audio/webm")
        .map_err(|e| e.to_string())?;

    let mut form = multipart::Form::new()
        .text("model", "whisper-large-v3")
        .part("file", part);

    if let Some(ref lang) = config.language {
        if !lang.is_empty() {
            form = form.text("language", lang.clone());
        }
    }

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.groq.com/openai/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let st = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Groq API {}: {}", st, body));
    }

    #[derive(Deserialize)]
    struct T {
        text: String,
    }
    let r: T = resp.json().await.map_err(|e| e.to_string())?;
    Ok(r.text)
}

#[tauri::command]
fn paste_text(text: String) -> Result<(), String> {
    let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(&text).map_err(|e| e.to_string())?;
    thread::sleep(Duration::from_millis(80));
    let mut e = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    e.key(Key::Control, Direction::Press).map_err(|e| e.to_string())?;
    e.key(Key::Unicode('v'), Direction::Click).map_err(|e| e.to_string())?;
    e.key(Key::Control, Direction::Release).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn show_overlay(app: tauri::AppHandle, state: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.show();
        let _ = app.emit("overlay-state", state);
    }
    Ok(())
}

#[tauri::command]
fn hide_overlay(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.hide();
    }
    Ok(())
}

struct HookState {
    keys: Vec<u32>,
    pressed: HashSet<u32>,
    active: bool,
    enabled: bool,
    app: tauri::AppHandle,
}

static HOOK: Mutex<Option<HookState>> = Mutex::new(None);

fn key_to_vk(name: &str) -> u32 {
    match name {
        "Control" => 0x11,
        "Shift" => 0x10,
        "Alt" => 0x12,
        "Meta" | "Win" => 0x5B,
        "Space" | " " => 0x20,
        "Tab" => 0x09,
        "CapsLock" => 0x14,
        "Escape" => 0x1B,
        "Backspace" => 0x08,
        "Enter" => 0x0D,
        s if s.len() == 1 => s.chars().next().unwrap().to_ascii_uppercase() as u32,
        s if s.starts_with('F') => s[1..].parse::<u32>().map(|n| 0x6F + n).unwrap_or(0),
        _ => 0,
    }
}

fn normalize_vk(vk: u32) -> u32 {
    match vk {
        0xA0 | 0xA1 => 0x10,
        0xA2 | 0xA3 => 0x11,
        0xA4 | 0xA5 => 0x12,
        0x5C => 0x5B,
        v => v,
    }
}

fn update_hook_keys(names: Vec<String>) {
    if let Ok(mut g) = HOOK.lock() {
        if let Some(ref mut s) = *g {
            s.keys = names.iter().map(|n| key_to_vk(n)).collect();
            s.pressed.clear();
            s.active = false;
        }
    }
}

unsafe extern "system" fn kb_proc(
    code: i32,
    wparam: win::WPARAM,
    lparam: win::LPARAM,
) -> win::LRESULT {
    if code >= 0 {
        let kb = &*(lparam as *const win::KBDLLHOOKSTRUCT);
        let vk = normalize_vk(kb.vkCode);

        if let Ok(mut g) = HOOK.try_lock() {
            if let Some(ref mut s) = *g {
                if s.enabled && s.keys.contains(&vk) {
                    let msg = wparam as u32;
                    if msg == win::WM_KEYDOWN || msg == win::WM_SYSKEYDOWN {
                        s.pressed.insert(vk);
                        if !s.active && s.keys.iter().all(|k| s.pressed.contains(k)) {
                            s.active = true;
                            let _ = s.app.emit("start-recording", ());
                            if let Some(w) = s.app.get_webview_window("overlay") {
                                let _ = w.show();
                            }
                            let _ = s.app.emit("overlay-state", "recording");
                        }
                    } else if msg == win::WM_KEYUP || msg == win::WM_SYSKEYUP {
                        s.pressed.remove(&vk);
                        if s.active {
                            s.active = false;
                            let _ = s.app.emit("stop-recording", ());
                        }
                    }
                }
            }
        }
    }
    win::CallNextHookEx(0, code, wparam, lparam)
}

fn start_hook(app: tauri::AppHandle, keys: Vec<String>) {
    let vks: Vec<u32> = keys.iter().map(|k| key_to_vk(k)).collect();
    *HOOK.lock().unwrap() = Some(HookState {
        keys: vks,
        pressed: HashSet::new(),
        active: false,
        enabled: true,
        app,
    });

    thread::spawn(|| unsafe {
        let hook = win::SetWindowsHookExW(win::WH_KEYBOARD_LL, kb_proc, 0, 0);
        if hook == 0 {
            return;
        }
        let mut msg = std::mem::zeroed::<win::MSG>();
        while win::GetMessageW(&mut msg, 0, 0, 0) > 0 {}
        win::UnhookWindowsHookEx(hook);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::menu::{MenuBuilder, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = MenuBuilder::new(app).item(&show).separator().item(&quit).build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("speech2text")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            let overlay = tauri::WebviewWindowBuilder::new(
                app,
                "overlay",
                tauri::WebviewUrl::App("overlay.html".into()),
            )
            .title("")
            .inner_size(320.0, 80.0)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .resizable(false)
            .focused(false)
            .build()?;

            if let Ok(Some(monitor)) = overlay.current_monitor() {
                let size = monitor.size();
                let scale = monitor.scale_factor();
                let x = (size.width as f64 / scale - 320.0) / 2.0;
                let _ = overlay.set_position(tauri::Position::Logical(
                    tauri::LogicalPosition::new(x, 0.0),
                ));
            }
            let _ = overlay.set_ignore_cursor_events(true);

            let config = read_config(&app.handle());
            let keybind = config
                .keybind
                .unwrap_or_else(|| vec!["Control".into(), "Shift".into()]);
            start_hook(app.handle().clone(), keybind);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_api_key,
            load_api_key,
            save_language,
            load_language,
            save_keybind,
            load_keybind,
            set_hook_enabled,
            transcribe,
            paste_text,
            exit_app,
            show_overlay,
            hide_overlay,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start");
}
