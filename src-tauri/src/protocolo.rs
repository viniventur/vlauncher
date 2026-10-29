//! O que o launcher e o `vl` (src/bin/vl.rs) combinam: o nome do canal local. Este arquivo entra nos
//! dois binários (o `vl` o inclui com #[path]): só a biblioteca padrão, nada do Tauri.
//!
//! A conversa é uma linha de JSON em cada sentido. O pedido: `{"comando": "rodar", "args": {"app":
//! "loja", "variacao": "dev"}, "pasta": "D:\\projetos\\loja"}` (a pasta é a de onde o `vl` foi
//! chamado). A resposta: `{"ok": true, "texto": "...", "dados": {...}}` ou `{"ok": false, "erro":
//! "..."}`.

/// O named pipe do launcher aberto. Um por pessoa (o nome de um pipe vale para a máquina inteira) e,
/// num teste isolado (LAUNCHER_DADOS), um por pasta de teste: o `vl` de um teste fala com o launcher
/// do teste, nunca com o instalado.
pub fn nome_do_canal() -> String {
    let usuario: String = std::env::var("USERNAME")
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        .collect();
    let mut nome = format!(r"\\.\pipe\vlauncher-{usuario}");
    if let Some(pasta) = std::env::var_os("LAUNCHER_DADOS").filter(|v| !v.is_empty()) {
        let pasta = pasta.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_lowercase();
        nome.push_str(&format!("-teste-{:08x}", fnv1a(pasta.as_bytes())));
    }
    nome
}

/// FNV-1a de 32 bits: um resumo curto e estável (o do DefaultHasher pode mudar entre versões do Rust).
fn fnv1a(bytes: &[u8]) -> u32 {
    bytes.iter().fold(0x811c_9dc5, |h, &b| (h ^ b as u32).wrapping_mul(0x0100_0193))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_resumo_da_pasta_de_teste_e_estavel() {
        assert_eq!(fnv1a(b""), 0x811c_9dc5);
        assert_eq!(fnv1a(b"a"), 0xe40c_292c);
    }
}
