#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if !speech2text_lib::is_elevated() {
        speech2text_lib::elevate_self();
        return;
    }
    speech2text_lib::run()
}
