mod dados;
mod git;
mod janela;
mod processos;
mod projetos;
mod sistema;
mod vidro;

use tauri::{Manager, RunEvent, WindowEvent};

pub fn run() {
    // Num teste isolado (LAUNCHER_DADOS), o WebView2 também fica noutra pasta: dois launchers não
    // podem dividir a mesma com opções diferentes (a porta do DevTools remoto, por exemplo), e o
    // instalado pode estar aberto.
    if let Some(pasta) = dados::pasta_de_teste() {
        if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none() {
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", pasta.join("webview"));
        }
    }

    let construtor = tauri::Builder::default();
    // No instalado, abrir o launcher de novo só traz a janela que já está aberta. No `pnpm app`, não:
    // o de desenvolvimento precisa rodar ao lado do instalado.
    #[cfg(not(debug_assertions))]
    let construtor = construtor.plugin(tauri_plugin_single_instance::init(|app, _, _| janela::mostrar(app)));
    construtor
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(processos::Execucoes::default())
        .setup(|app| {
            // As fotos de uma pasta de teste (LAUNCHER_DADOS) também passam pelo protocolo asset.
            if let Some(pasta) = dados::pasta_de_teste() {
                app.asset_protocol_scope().allow_directory(pasta.join("imagens"), true)?;
            }
            janela::criar_bandeja(app.handle())?;
            registrar_atalho(app.handle());
            if let Some(principal) = app.get_webview_window("principal") {
                vidro::instalar(&principal);
            }
            Ok(())
        })
        .on_window_event(|janela, evento| {
            // Com app rodando, fechar só esconde: os servidores seguem no ar, e a bandeja traz a
            // janela de volta. Sem nada rodando, fecha de vez.
            if let WindowEvent::CloseRequested { api, .. } = evento {
                if processos::rodando(janela.app_handle()) > 0 {
                    api.prevent_close();
                    let _ = janela.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            dados::caminho_dados,
            dados::carregar_config,
            dados::salvar_config,
            dados::importar_imagem,
            dados::importar_imagem_colada,
            dados::remover_imagem,
            processos::iniciar_execucao,
            processos::parar_execucao,
            processos::parar_todas,
            processos::reiniciar_execucao,
            processos::descartar_execucao,
            processos::listar_execucoes,
            processos::linhas_da_execucao,
            processos::limpar_linhas,
            git::listar_locais,
            git::buscar_branches,
            git::criar_worktree,
            git::trocar_branch,
            git::copiar_arquivos_locais,
            projetos::inspecionar_pasta,
            projetos::escanear_pasta,
            sistema::abrir_url,
            sistema::abrir_pasta,
            sistema::abrir_vscode,
            sistema::abrir_terminal,
            sistema::abrir_claude,
            vidro::manter_vidro_ativo,
        ])
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o launcher")
        .run(|app, evento| {
            if let RunEvent::Exit = evento {
                processos::encerrar_todas(app);
            }
        });
}

/// Ctrl+Alt+Espaço, de qualquer lugar do Windows: traz o launcher com a busca aberta.
fn registrar_atalho(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    let atalho = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, recebido, evento| {
            if recebido == &atalho && evento.state() == ShortcutState::Pressed {
                janela::alternar(app);
            }
        })
        .build();
    if app.plugin(plugin).is_ok() {
        if let Err(erro) = app.global_shortcut().register(atalho) {
            eprintln!("atalho Ctrl+Alt+Espaço indisponível: {erro}");
        }
    }
}
