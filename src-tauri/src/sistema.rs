//! O que o launcher pede ao Windows: rodar um programa sem piscar janela de console, abrir pastas,
//! o VS Code, o Windows Terminal e o navegador.

use std::os::windows::process::CommandExt;
use std::process::Command;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// Processo sem janela de console (sem isso, cada git ou taskkill pisca um cmd na tela).
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Grupo de processos próprio: o Ctrl+C de um app não chega aos outros.
pub const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

/// Um `Command` que não abre janela de console.
pub fn comando(programa: &str) -> Command {
    let mut c = Command::new(programa);
    c.creation_flags(CREATE_NO_WINDOW);
    c
}

/// As variáveis de ambiente como `set "CHAVE=valor" && ` para a frente de um comando do cmd.
fn prefixo_env(env: &[(String, String)]) -> String {
    env.iter()
        .filter(|(k, _)| !k.trim().is_empty())
        .map(|(k, v)| format!("set \"{}={}\" && ", k.trim(), v))
        .collect()
}

#[tauri::command]
pub fn abrir_url(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Só abro endereços http e https.".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn abrir_pasta(app: AppHandle, pasta: String) -> Result<(), String> {
    app.opener().open_path(pasta, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn abrir_vscode(pasta: String) -> Result<(), String> {
    // O `code` do PATH é um .cmd: precisa do cmd para rodar.
    comando("cmd")
        .args(["/D", "/C", "code", &pasta])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Não consegui abrir o VS Code: {e}"))
}

/// Abre o Windows Terminal na pasta, rodando o comando se vier um (e deixando o terminal aberto
/// depois). Sem o Windows Terminal, cai para uma janela do cmd.
#[tauri::command]
pub fn abrir_terminal(pasta: String, comando_inicial: Option<String>, env: Option<Vec<(String, String)>>) -> Result<(), String> {
    let env = env.unwrap_or_default();
    let linha = comando_inicial
        .filter(|c| !c.trim().is_empty())
        .map(|c| format!("{}{}", prefixo_env(&env), c));

    let mut wt = comando("wt.exe");
    wt.args(["-d", &pasta]);
    if let Some(linha) = &linha {
        wt.args(["cmd", "/K", linha]);
    }
    if wt.spawn().is_ok() {
        return Ok(());
    }

    // O `start ""` precisa chegar ao cmd com as aspas como estão: daí o raw_arg.
    let mut cmd = Command::new("cmd");
    cmd.current_dir(&pasta).raw_arg(match &linha {
        Some(linha) => format!("/C start \"\" cmd /K {linha}"),
        None => "/C start \"\" cmd".into(),
    });
    cmd.spawn().map(|_| ()).map_err(|e| format!("Não consegui abrir o terminal: {e}"))
}

/// O comando de uma conta do Claude Code (`claude`, `claude --continue`, uma função do perfil do
/// PowerShell...). Só letras, números, espaço e `-_.=`: ele vai para a linha do PowerShell, e um
/// `;` ou um `&` ali rodaria outra coisa junto.
pub fn comando_do_claude(comando: &str) -> Result<&str, String> {
    let comando = comando.trim();
    let valido = !comando.is_empty()
        && comando.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.' | '='));
    if valido {
        Ok(comando)
    } else {
        Err(format!("Comando do Claude Code inválido: \"{comando}\". Use só letras, números, espaço e -_.="))
    }
}

fn no_path(programa: &str) -> bool {
    std::env::var_os("PATH").is_some_and(|path| std::env::split_paths(&path).any(|pasta| pasta.join(programa).is_file()))
}

/// O Claude Code na pasta, com o comando da conta escolhida. Abre o PowerShell (que carrega o perfil)
/// e não o cmd: quem tem mais de uma conta costuma escolhê-la por uma função do perfil, que muda a
/// CLAUDE_CONFIG_DIR antes de chamar o `claude`.
#[tauri::command]
pub fn abrir_claude(pasta: String, comando: String) -> Result<(), String> {
    let linha = comando_do_claude(&comando)?;
    let shell = if no_path("pwsh.exe") { "pwsh.exe" } else { "powershell.exe" };

    let mut wt = self::comando("wt.exe");
    wt.args(["-d", &pasta, shell, "-NoExit", "-Command", linha]);
    if wt.spawn().is_ok() {
        return Ok(());
    }

    let mut cmd = Command::new("cmd");
    cmd.current_dir(&pasta).raw_arg(format!("/C start \"\" {shell} -NoExit -Command {linha}"));
    cmd.spawn().map(|_| ()).map_err(|e| format!("Não consegui abrir o Claude Code: {e}"))
}

/// Encerra um processo e todos os que ele abriu (o `npm run dev` abre node, que abre o vite...).
pub fn matar_arvore(pid: u32) {
    let _ = comando("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).output();
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn aceita_so_comandos_simples_para_o_claude() {
        assert_eq!(comando_do_claude(" claude "), Ok("claude"));
        assert_eq!(comando_do_claude("claude-trabalho --continue"), Ok("claude-trabalho --continue"));
        for perigoso in ["claude; Remove-Item x", "claude & calc", "claude | x", "$(calc)", "claude `calc`", ""] {
            assert!(comando_do_claude(perigoso).is_err(), "{perigoso}");
        }
    }
}
