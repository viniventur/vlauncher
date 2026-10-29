//! A janela principal, a bandeja e o atalho global. Com algum app rodando, fechar a janela só a
//! esconde: os servidores continuam no ar e a bandeja traz a janela de volta.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const JANELA: &str = "principal";
const BANDEJA: &str = "bandeja";

pub fn mostrar(app: &AppHandle) {
    if let Some(janela) = app.get_webview_window(JANELA) {
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

/// O `vl abrir`: traz a janela (a interface já abriu o painel do app).
#[tauri::command]
pub fn mostrar_janela(app: AppHandle) {
    mostrar(&app);
}

/// Aberto pelo `vl` (`--na-bandeja`), o launcher começa só na bandeja: quem pediu foi o terminal, e a
/// janela não rouba o foco de ninguém.
pub fn comecar_na_bandeja(args: &[String]) -> bool {
    args.iter().any(|a| a == "--na-bandeja")
}

/// O atalho global: traz o launcher com a busca aberta, ou esconde se ele já estiver na frente.
pub fn alternar(app: &AppHandle) {
    let Some(janela) = app.get_webview_window(JANELA) else { return };
    let na_frente = janela.is_visible().unwrap_or(false) && janela.is_focused().unwrap_or(false);
    if na_frente {
        let _ = janela.hide();
    } else {
        mostrar(app);
        let _ = app.emit("abrir-busca", ());
    }
}

pub fn criar_bandeja(app: &AppHandle) -> tauri::Result<()> {
    let mostrar_item = MenuItem::with_id(app, "mostrar", "Mostrar o vlauncher", true, None::<&str>)?;
    let parar = MenuItem::with_id(app, "parar", "Parar todos os apps", true, None::<&str>)?;
    let separador = PredefinedMenuItem::separator(app)?;
    let sair = MenuItem::with_id(app, "sair", "Encerrar os apps e sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&mostrar_item, &parar, &separador, &sair])?;

    let mut construtor = TrayIconBuilder::with_id(BANDEJA)
        .tooltip("vlauncher")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, evento| match evento.id.as_ref() {
            "mostrar" => mostrar(app),
            "parar" => confirmar_parar_todas(app),
            "sair" => {
                crate::processos::encerrar_todas(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|bandeja, evento| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                mostrar(bandeja.app_handle());
            }
        });
    if let Some(icone) = app.default_window_icon() {
        construtor = construtor.icon(icone.clone());
    }
    construtor.build(app)?;
    Ok(())
}

/// O "Parar todos os apps" da bandeja pergunta antes, como o botão do topo, dizendo o que vai parar.
fn confirmar_parar_todas(app: &AppHandle) {
    let lista = crate::processos::resumo_das_rodando(app);
    if lista.is_empty() {
        return;
    }
    let uma = lista.len() == 1;
    let texto = format!(
        "Tem certeza? {}\n\n{}",
        if uma { "Vai parar:".to_string() } else { format!("Vão parar as {}:", lista.len()) },
        lista.join("\n")
    );
    let app = app.clone();
    app.dialog()
        .message(texto)
        .title(if uma { "Parar a execução" } else { "Parar todas as execuções" })
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            if uma { "Parar" } else { "Parar todas" }.into(),
            "Cancelar".into(),
        ))
        .show({
            let app = app.clone();
            move |confirmou| {
                if confirmou {
                    crate::processos::parar_todas(app);
                }
            }
        });
}

pub fn atualizar_bandeja(app: &AppHandle) {
    let n = crate::processos::rodando(app);
    let texto = match n {
        0 => "vlauncher".to_string(),
        1 => "vlauncher: 1 app rodando".to_string(),
        n => format!("vlauncher: {n} apps rodando"),
    };
    if let Some(bandeja) = app.tray_by_id(BANDEJA) {
        let _ = bandeja.set_tooltip(Some(texto));
    }
}
