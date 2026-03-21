#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use arboard::Clipboard;
use base64::Engine;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager};

#[derive(Serialize, Deserialize, Default)]
struct Config {
    api_key: Option<String>,
}

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&dir).ok();
    dir.join("config.json")
}

#[tauri::command]
fn save_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let config = Config {
        api_key: Some(key),
    };
    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    fs::write(config_path(&app), json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_api_key(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = config_path(&app);
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let config: Config = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(config.api_key)
}

#[tauri::command]
async fn transcribe(app: tauri::AppHandle, audio_base64: String) -> Result<String, String> {
    let api_key = load_api_key(app)?.ok_or("No API key configured")?;

    let audio_data = base64::engine::general_purpose::STANDARD
        .decode(&audio_base64)
        .map_err(|e| e.to_string())?;

    let part = multipart::Part::bytes(audio_data)
        .file_name("audio.webm")
        .mime_str("audio/webm")
        .map_err(|e| e.to_string())?;

    let form = multipart::Form::new()
        .text("model", "whisper-large-v3")
        .part("file", part);

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.groq.com/openai/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Groq API {}: {}", status, body));
    }

    #[derive(Deserialize)]
    struct Transcription {
        text: String,
    }

    let result: Transcription = response.json().await.map_err(|e| e.to_string())?;
    Ok(result.text)
}

#[tauri::command]
fn paste_text(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(&text).map_err(|e| e.to_string())?;

    thread::sleep(Duration::from_millis(80));

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|e| e.to_string())?;
    enigo
        .key(Key::Unicode('v'), Direction::Click)
        .map_err(|e| e.to_string())?;
    enigo
        .key(Key::Control, Direction::Release)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    match event.state {
                        ShortcutState::Pressed => {
                            let _ = app.emit("start-recording", ());
                        }
                        ShortcutState::Released => {
                            let _ = app.emit("stop-recording", ());
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
            let shortcut =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
            app.global_shortcut().register(shortcut)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_api_key,
            load_api_key,
            transcribe,
            paste_text,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start");
}
