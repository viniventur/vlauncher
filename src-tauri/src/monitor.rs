//! O monitor: quanto cada execução pesa na máquina. A cada 2 s, enquanto alguma estiver rodando, soma
//! a CPU e a memória da árvore de processos dela (o cmd que o launcher abriu, o npm, o node, o
//! vite...) e acha as portas TCP em que ela escuta. Mede como o Gerenciador de Tarefas: a CPU em
//! porcentagem da máquina inteira (todos os núcleos) e a memória pelo conjunto de trabalho privado.
//! O histórico fica com a interface (src/lib/monitor.ts).

use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::mem::{size_of, zeroed};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE};
use windows_sys::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCP6TABLE_OWNER_PID, MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID,
    TCP_TABLE_OWNER_PID_LISTENER,
};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX2};
use windows_sys::Win32::System::SystemInformation::{GetSystemTimeAsFileTime, GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows_sys::Win32::System::Threading::{
    GetProcessTimes, GetSystemTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ,
};

pub const EVENTO: &str = "monitor:amostra";
const INTERVALO: Duration = Duration::from_secs(2);
/// Os processos de cada execução que vão para a interface: os que mais pesam.
const MAX_PROCESSOS: usize = 24;
const AF_INET: u32 = 2;
const AF_INET6: u32 = 23;
const ERROR_INSUFFICIENT_BUFFER: u32 = 122;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Processo {
    pub pid: u32,
    pub nome: String,
    /// Porcentagem da máquina inteira, como no Gerenciador de Tarefas.
    pub cpu: f32,
    /// Bytes do conjunto de trabalho privado.
    pub memoria: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Uso {
    pub id: String,
    pub cpu: f32,
    pub memoria: u64,
    /// As portas TCP em que algum processo da execução escuta.
    pub portas: Vec<u16>,
    /// Quantos processos a execução tem agora.
    pub quantos: u32,
    pub processos: Vec<Processo>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Amostra {
    /// Milissegundos desde 1970.
    pub instante: u64,
    pub nucleos: u32,
    pub cpu_maquina: f32,
    pub memoria_usada: u64,
    pub memoria_total: u64,
    pub execucoes: Vec<Uso>,
}

/// O que a amostra anterior viu: o tempo de CPU de cada processo (pelo PID e pela hora em que ele
/// nasceu, porque o Windows reaproveita os PIDs) e os tempos da máquina.
#[derive(Default)]
struct Anterior {
    /// FILETIME (100 ns desde 1601) da amostra anterior; 0 antes da primeira.
    quando: u64,
    cpu: HashMap<(u32, u64), u64>,
    sistema: Option<(u64, u64, u64)>,
}

struct Medida {
    criacao: u64,
    cpu: u64,
    memoria: u64,
}

/// Mede de 2 em 2 s enquanto houver execução rodando; parada, avisa uma vez (a lista vazia) e espera.
pub fn iniciar(app: AppHandle) {
    thread::spawn(move || {
        let mut anterior = Anterior::default();
        let mut havia = false;
        loop {
            thread::sleep(INTERVALO);
            let raizes = crate::processos::raizes_rodando(&app);
            if raizes.is_empty() {
                if havia {
                    let (memoria_usada, memoria_total) = memoria_da_maquina();
                    let vazia = Amostra {
                        instante: agora_ms(),
                        nucleos: nucleos(),
                        cpu_maquina: 0.0,
                        memoria_usada,
                        memoria_total,
                        execucoes: vec![],
                    };
                    let _ = app.emit(EVENTO, vazia);
                    anterior = Anterior::default();
                    havia = false;
                }
                // Os tempos da máquina seguem em dia (é uma leitura barata): a CPU dela já vem certa
                // na primeira amostra depois que algo começa a rodar.
                anterior.sistema = tempos_do_sistema();
                continue;
            }
            havia = true;
            let amostra = medir(&raizes, &mut anterior);
            let _ = app.emit(EVENTO, amostra);
        }
    });
}

fn medir(raizes: &[(String, u32)], anterior: &mut Anterior) -> Amostra {
    let agora = agora_filetime();
    let nucleos = nucleos();
    let tempo = if anterior.quando > 0 { agora.saturating_sub(anterior.quando) } else { 0 };

    let mut filhos: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut nomes: HashMap<u32, String> = HashMap::new();
    for (pid, pai, nome) in fotografar() {
        // O processo ocioso do sistema (PID 0) é "pai" de si mesmo.
        if pid != pai {
            filhos.entry(pai).or_default().push(pid);
        }
        nomes.insert(pid, nome);
    }
    let portas = portas_por_pid();

    let mut medidas: HashMap<u32, Option<Medida>> = HashMap::new();
    let mut cpu_agora: HashMap<(u32, u64), u64> = HashMap::new();
    let mut execucoes = Vec::with_capacity(raizes.len());

    for (id, raiz) in raizes {
        let pids = arvore(*raiz, &filhos, &mut |pid| {
            medidas.entry(pid).or_insert_with(|| medir_processo(pid)).as_ref().map(|m| m.criacao)
        });
        let mut lista = Vec::with_capacity(pids.len());
        let mut portas_da_execucao = Vec::new();
        for pid in pids {
            let Some(Some(m)) = medidas.get(&pid) else { continue };
            let chave = (pid, m.criacao);
            let (gasto, intervalo) = match anterior.cpu.get(&chave) {
                Some(&antes) => (m.cpu.saturating_sub(antes), tempo),
                // Nasceu depois da amostra anterior: todo o tempo de CPU dele é deste intervalo.
                None if anterior.quando > 0 && m.criacao >= anterior.quando => (m.cpu, tempo),
                // Sem amostra anterior (a primeira de todas, ou um processo que ela não viu): a média
                // desde que ele nasceu, em vez de um zero que não aconteceu.
                None => (m.cpu, agora.saturating_sub(m.criacao)),
            };
            cpu_agora.insert(chave, m.cpu);
            if let Some(p) = portas.get(&pid) {
                portas_da_execucao.extend_from_slice(p);
            }
            lista.push(Processo {
                pid,
                nome: nomes.get(&pid).cloned().unwrap_or_default(),
                cpu: taxa(gasto, intervalo, nucleos),
                memoria: m.memoria,
            });
        }
        portas_da_execucao.sort_unstable();
        portas_da_execucao.dedup();
        lista.sort_by_key(|p| std::cmp::Reverse(p.memoria));
        let cpu = lista.iter().map(|p| p.cpu).sum::<f32>().min(100.0);
        let memoria = lista.iter().map(|p| p.memoria).sum();
        let quantos = lista.len() as u32;
        lista.truncate(MAX_PROCESSOS);
        execucoes.push(Uso { id: id.clone(), cpu, memoria, portas: portas_da_execucao, quantos, processos: lista });
    }

    let sistema = tempos_do_sistema();
    let cpu_maquina = match (anterior.sistema, sistema) {
        (Some(antes), Some(depois)) => cpu_da_maquina(antes, depois),
        _ => 0.0,
    };
    let (memoria_usada, memoria_total) = memoria_da_maquina();
    *anterior = Anterior { quando: agora, cpu: cpu_agora, sistema };

    Amostra { instante: agora_ms(), nucleos, cpu_maquina, memoria_usada, memoria_total, execucoes }
}

/// Os processos da árvore de `raiz`: ela, os filhos, os netos... Um filho tem de ter nascido depois do
/// pai: o Windows reaproveita os PIDs, e o filho de um processo que já morreu pode apontar para um PID
/// que agora é de outro. `criacao` diz quando o processo nasceu (None: já não dá para medi-lo).
pub fn arvore(raiz: u32, filhos: &HashMap<u32, Vec<u32>>, criacao: &mut dyn FnMut(u32) -> Option<u64>) -> Vec<u32> {
    let Some(nascimento) = criacao(raiz) else { return vec![] };
    let mut vistos = HashSet::from([raiz]);
    let mut lista = vec![raiz];
    let mut fila = VecDeque::from([(raiz, nascimento)]);
    while let Some((pai, nascimento_do_pai)) = fila.pop_front() {
        for &filho in filhos.get(&pai).map(Vec::as_slice).unwrap_or_default() {
            if !vistos.insert(filho) {
                continue;
            }
            if let Some(n) = criacao(filho).filter(|&n| n >= nascimento_do_pai) {
                lista.push(filho);
                fila.push_back((filho, n));
            }
        }
    }
    lista
}

/// A CPU gasta no intervalo, em porcentagem da máquina inteira (todos os núcleos).
pub fn taxa(gasto: u64, intervalo: u64, nucleos: u32) -> f32 {
    if intervalo == 0 || nucleos == 0 {
        return 0.0;
    }
    (gasto as f64 / (intervalo as f64 * nucleos as f64) * 100.0).clamp(0.0, 100.0) as f32
}

/// A CPU da máquina entre duas leituras de (ocioso, kernel, usuário); o tempo de kernel inclui o ocioso.
pub fn cpu_da_maquina(antes: (u64, u64, u64), depois: (u64, u64, u64)) -> f32 {
    let ocioso = depois.0.saturating_sub(antes.0);
    let total = depois.1.saturating_sub(antes.1) + depois.2.saturating_sub(antes.2);
    if total == 0 {
        return 0.0;
    }
    (total.saturating_sub(ocioso) as f64 / total as f64 * 100.0).clamp(0.0, 100.0) as f32
}

/// A porta de uma linha da tabela TCP: os 16 bits de baixo, na ordem da rede.
pub fn porta(campo: u32) -> u16 {
    u16::from_be(campo as u16)
}

fn nucleos() -> u32 {
    thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(1)
}

fn agora_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn filetime(t: FILETIME) -> u64 {
    ((t.dwHighDateTime as u64) << 32) | t.dwLowDateTime as u64
}

fn agora_filetime() -> u64 {
    // SAFETY: só escreve no FILETIME passado.
    unsafe {
        let mut t: FILETIME = zeroed();
        GetSystemTimeAsFileTime(&mut t);
        filetime(t)
    }
}

/// Todos os processos do Windows agora: (pid, pid do pai, nome do executável).
fn fotografar() -> Vec<(u32, u32, String)> {
    // SAFETY: a foto é fechada no fim; a entrada tem o dwSize que a API pede.
    unsafe {
        let foto = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if foto == INVALID_HANDLE_VALUE {
            return vec![];
        }
        let mut entrada: PROCESSENTRY32W = zeroed();
        entrada.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut lista = Vec::with_capacity(400);
        let mut tem = Process32FirstW(foto, &mut entrada) != 0;
        while tem {
            let nome = &entrada.szExeFile;
            let fim = nome.iter().position(|&c| c == 0).unwrap_or(nome.len());
            lista.push((entrada.th32ProcessID, entrada.th32ParentProcessID, String::from_utf16_lossy(&nome[..fim])));
            tem = Process32NextW(foto, &mut entrada) != 0;
        }
        CloseHandle(foto);
        lista
    }
}

/// Quando o processo nasceu, a CPU que já gastou (kernel + usuário) e a memória. None se ele já
/// terminou ou não deixa ser lido.
fn medir_processo(pid: u32) -> Option<Medida> {
    // SAFETY: o handle é fechado antes de sair; cada estrutura vai com o tamanho que a API pede.
    unsafe {
        let mut processo = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, 0, pid);
        if processo.is_null() {
            processo = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        }
        if processo.is_null() {
            return None;
        }
        let (mut criacao, mut saida, mut kernel, mut usuario): (FILETIME, FILETIME, FILETIME, FILETIME) =
            (zeroed(), zeroed(), zeroed(), zeroed());
        let tempos = GetProcessTimes(processo, &mut criacao, &mut saida, &mut kernel, &mut usuario) != 0;

        // O EX2 traz o conjunto de trabalho privado (a coluna Memória do Gerenciador de Tarefas); num
        // Windows que não o conheça, fica o conjunto de trabalho inteiro.
        let mut contadores: PROCESS_MEMORY_COUNTERS_EX2 = zeroed();
        contadores.cb = size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32;
        let memoria = if K32GetProcessMemoryInfo(processo, (&raw mut contadores).cast::<PROCESS_MEMORY_COUNTERS>(), contadores.cb) != 0 {
            if contadores.PrivateWorkingSetSize > 0 { contadores.PrivateWorkingSetSize } else { contadores.WorkingSetSize }
        } else {
            let mut basicos: PROCESS_MEMORY_COUNTERS = zeroed();
            basicos.cb = size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
            if K32GetProcessMemoryInfo(processo, &mut basicos, basicos.cb) != 0 { basicos.WorkingSetSize } else { 0 }
        };
        CloseHandle(processo);

        (tempos && filetime(saida) == 0).then(|| Medida {
            criacao: filetime(criacao),
            cpu: filetime(kernel) + filetime(usuario),
            memoria: memoria as u64,
        })
    }
}

fn tempos_do_sistema() -> Option<(u64, u64, u64)> {
    // SAFETY: só escreve nos três FILETIME passados.
    unsafe {
        let (mut ocioso, mut kernel, mut usuario): (FILETIME, FILETIME, FILETIME) = (zeroed(), zeroed(), zeroed());
        (GetSystemTimes(&mut ocioso, &mut kernel, &mut usuario) != 0).then(|| (filetime(ocioso), filetime(kernel), filetime(usuario)))
    }
}

/// (usada, total) da memória física, em bytes.
fn memoria_da_maquina() -> (u64, u64) {
    // SAFETY: a estrutura vai com o dwLength que a API pede.
    unsafe {
        let mut estado: MEMORYSTATUSEX = zeroed();
        estado.dwLength = size_of::<MEMORYSTATUSEX>() as u32;
        if GlobalMemoryStatusEx(&mut estado) == 0 {
            return (0, 0);
        }
        (estado.ullTotalPhys.saturating_sub(estado.ullAvailPhys), estado.ullTotalPhys)
    }
}

/// As portas TCP em escuta (IPv4 e IPv6) de cada processo.
fn portas_por_pid() -> HashMap<u32, Vec<u16>> {
    let mut mapa: HashMap<u32, Vec<u16>> = HashMap::new();
    let ipv4 = tabela_tcp(AF_INET);
    for linha in linhas_da_tabela::<MIB_TCPROW_OWNER_PID>(&ipv4) {
        mapa.entry(linha.dwOwningPid).or_default().push(porta(linha.dwLocalPort));
    }
    let ipv6 = tabela_tcp(AF_INET6);
    for linha in linhas_da_tabela::<MIB_TCP6ROW_OWNER_PID>(&ipv6) {
        mapa.entry(linha.dwOwningPid).or_default().push(porta(linha.dwLocalPort));
    }
    for portas in mapa.values_mut() {
        portas.sort_unstable();
        portas.dedup();
    }
    mapa
}

/// A tabela das conexões TCP em escuta, com o dono de cada uma. Em u32 para ficar alinhada como as
/// estruturas da tabela; vazia se o Windows não a entregar.
fn tabela_tcp(familia: u32) -> Vec<u32> {
    let mut tamanho = 0u32;
    // SAFETY: a primeira chamada só pergunta o tamanho; a segunda escreve num buffer desse tamanho.
    unsafe {
        GetExtendedTcpTable(std::ptr::null_mut(), &mut tamanho, 0, familia, TCP_TABLE_OWNER_PID_LISTENER, 0);
        // A tabela pode crescer entre uma chamada e outra.
        for _ in 0..4 {
            let mut buffer = vec![0u32; (tamanho as usize).div_ceil(4) + 64];
            let mut cabe = (buffer.len() * 4) as u32;
            match GetExtendedTcpTable(buffer.as_mut_ptr().cast(), &mut cabe, 0, familia, TCP_TABLE_OWNER_PID_LISTENER, 0) {
                0 => return buffer,
                ERROR_INSUFFICIENT_BUFFER => tamanho = cabe,
                _ => return vec![],
            }
        }
    }
    vec![]
}

/// As linhas de uma tabela TCP: o primeiro u32 diz quantas são, e elas vêm logo depois. Nunca lê além
/// do buffer, mesmo que o número diga mais.
fn linhas_da_tabela<T: Copy>(buffer: &[u32]) -> Vec<T> {
    let Some(&quantas) = buffer.first() else { return vec![] };
    // Nas duas tabelas (MIB_TCPTABLE_OWNER_PID e MIB_TCP6TABLE_OWNER_PID), as linhas começam no
    // byte 4: o número é um u32 e as linhas têm alinhamento de 4.
    debug_assert_eq!(size_of::<MIB_TCPTABLE_OWNER_PID>(), 4 + size_of::<MIB_TCPROW_OWNER_PID>());
    debug_assert_eq!(size_of::<MIB_TCP6TABLE_OWNER_PID>(), 4 + size_of::<MIB_TCP6ROW_OWNER_PID>());
    let cabem = (buffer.len() - 1) * 4 / size_of::<T>();
    let quantas = (quantas as usize).min(cabem);
    // SAFETY: as `quantas` linhas cabem no buffer (conferido acima), e o ponteiro está alinhado a 4.
    unsafe { std::slice::from_raw_parts(buffer.as_ptr().add(1).cast::<T>(), quantas).to_vec() }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn mapa(pares: &[(u32, u32)]) -> HashMap<u32, Vec<u32>> {
        let mut filhos: HashMap<u32, Vec<u32>> = HashMap::new();
        for &(pai, filho) in pares {
            filhos.entry(pai).or_default().push(filho);
        }
        filhos
    }

    #[test]
    fn a_arvore_desce_pelos_filhos_e_netos() {
        // cmd (10) → npm (11) → node (12) → esbuild (13); 20 é de outra árvore.
        let filhos = mapa(&[(10, 11), (11, 12), (12, 13), (1, 20), (1, 10)]);
        let nascimento: HashMap<u32, u64> = HashMap::from([(10, 100), (11, 110), (12, 120), (13, 130), (20, 50)]);
        let mut lista = arvore(10, &filhos, &mut |pid| nascimento.get(&pid).copied());
        lista.sort();
        assert_eq!(lista, vec![10, 11, 12, 13]);
    }

    #[test]
    fn um_pid_reaproveitado_nao_entra_na_arvore() {
        // O 11 morreu e o PID foi parar num processo mais velho que o pai: ele e os filhos ficam fora.
        let filhos = mapa(&[(10, 11), (11, 12)]);
        let nascimento: HashMap<u32, u64> = HashMap::from([(10, 100), (11, 90), (12, 95)]);
        assert_eq!(arvore(10, &filhos, &mut |pid| nascimento.get(&pid).copied()), vec![10]);
        // A raiz que já não se mede não tem árvore.
        assert!(arvore(99, &filhos, &mut |_| None).is_empty());
    }

    #[test]
    fn ciclos_nao_prendem_a_arvore() {
        let filhos = mapa(&[(10, 11), (11, 10)]);
        let mut lista = arvore(10, &filhos, &mut |_| Some(1));
        lista.sort();
        assert_eq!(lista, vec![10, 11]);
    }

    #[test]
    fn a_cpu_e_da_maquina_inteira() {
        // 1 s de CPU em 2 s de relógio numa máquina de 4 núcleos: 12,5%.
        assert_eq!(taxa(10_000_000, 20_000_000, 4), 12.5);
        assert_eq!(taxa(5, 0, 4), 0.0);
        assert_eq!(taxa(100, 10, 1), 100.0);
        // Ocioso 30 de 40 (kernel 25 com o ocioso dentro, usuário 15): 25% ocupada.
        assert_eq!(cpu_da_maquina((0, 0, 0), (30, 25, 15)), 25.0);
    }

    #[test]
    fn a_porta_vem_na_ordem_da_rede() {
        // 5173 = 0x1435: na tabela, 0x3514 (os bytes trocados), com lixo nos 16 bits de cima.
        assert_eq!(porta(0xABCD_3514), 5173);
    }

    #[test]
    fn as_linhas_nunca_passam_do_buffer() {
        // O número diz 5 linhas, mas só cabe uma de 6 u32.
        let buffer = vec![5u32, 1, 2, 3, 4, 5, 6, 7];
        let linhas = linhas_da_tabela::<MIB_TCPROW_OWNER_PID>(&buffer);
        assert_eq!(linhas.len(), 1);
        assert_eq!(linhas[0].dwOwningPid, 6);
    }

    #[test]
    fn mede_o_proprio_processo() {
        let m = medir_processo(std::process::id()).expect("o próprio processo se mede");
        assert!(m.memoria > 0 && m.criacao > 0);
        assert!(!fotografar().is_empty());
        let (usada, total) = memoria_da_maquina();
        assert!(total > 0 && usada <= total);
    }
}
