//! O acrylic do liquid glass com a janela sem foco. O Windows 11 decide a aparência do fundo do
//! sistema (o acrylic) pelo estado de ativação da moldura: quando a janela perde o foco, ela recebe
//! WM_NCACTIVATE com FALSE e o acrylic vira uma cor sólida. Com o vidro ligado, o launcher responde a
//! essa mensagem como se continuasse ativo, e o acrylic segue desfocando o que está atrás (medido com
//! uma janela de listras atrás: idêntico ao de com foco). O foco do teclado vem de outras mensagens e
//! não muda; só a barra de título também fica com a cor de janela ativa.

use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SendMessageW, WM_NCACTIVATE};

static SEMPRE_ATIVA: AtomicBool = AtomicBool::new(false);
static JANELA: AtomicIsize = AtomicIsize::new(0);

unsafe extern "system" fn procedimento(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _dados: usize) -> LRESULT {
    let wparam = if msg == WM_NCACTIVATE && SEMPRE_ATIVA.load(Ordering::Relaxed) { 1 } else { wparam };
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// Passa a ver as mensagens da janela antes do Tauri (só a WM_NCACTIVATE muda, e só com o vidro).
pub fn instalar(janela: &tauri::WebviewWindow) {
    let Ok(hwnd) = janela.hwnd() else { return };
    let hwnd = hwnd.0 as HWND;
    JANELA.store(hwnd as isize, Ordering::Relaxed);
    unsafe {
        SetWindowSubclass(hwnd, Some(procedimento), 1, 0);
    }
}

/// Liga com o acrylic do liquid glass e desliga sem ele.
#[tauri::command]
pub fn manter_vidro_ativo(ligado: bool) {
    SEMPRE_ATIVA.store(ligado, Ordering::Relaxed);
    let hwnd = JANELA.load(Ordering::Relaxed) as HWND;
    if hwnd.is_null() {
        return;
    }
    // A janela pode estar sem foco agora: a moldura vai já para o estado certo.
    let ativa = ligado || unsafe { GetForegroundWindow() } == hwnd;
    unsafe {
        SendMessageW(hwnd, WM_NCACTIVATE, ativa as WPARAM, 0);
    }
}
