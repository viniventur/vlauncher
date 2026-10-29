// Os projetos da pasta do grupo que ainda não estão no launcher. Cada um entra com as variações que
// sobem o app inteiro (os *:all; sem eles, o dev).

import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { avisar } from '../lib/avisos'
import { useConfig } from '../lib/config'
import { descreverProjeto, escolherSugestoes, variacaoDe } from '../lib/projetos'
import { mesmaPasta } from '../lib/texto'
import type { Projeto } from '../lib/tipos'
import { useUi } from '../lib/ui'
import { Dialogo } from './Dialogo'

export function DialogoImportar({ grupoId }: { grupoId: string }) {
  const grupo = useConfig((s) => s.config.grupos.find((g) => g.id === grupoId))
  const grupos = useConfig((s) => s.config.grupos)
  const criarApp = useConfig((s) => s.criarApp)
  const abrirDialogo = useUi((s) => s.abrirDialogo)
  const [projetos, setProjetos] = useState<Projeto[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())

  const jaNoLauncher = useMemo(() => {
    const pastas = grupos.flatMap((g) => g.apps.map((a) => a.pasta))
    return (p: Projeto) => pastas.some((x) => mesmaPasta(x, p.pasta))
  }, [grupos])

  useEffect(() => {
    if (!grupo?.pasta) return
    api
      .escanearPasta(grupo.pasta)
      .then((lista) => {
        setProjetos(lista)
        // Já vêm marcados os que sobem com um comando (os outros podem entrar, mas sem variação).
        setMarcados(new Set(lista.filter((p) => !jaNoLauncher(p) && p.sugestoes.length > 0).map((p) => p.pasta)))
      })
      .catch((e) => setErro(String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo?.pasta])

  if (!grupo) return null

  const novos = projetos?.filter((p) => !jaNoLauncher(p)) ?? []
  const existentes = projetos?.filter(jaNoLauncher) ?? []

  const alternar = (pasta: string) =>
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(pasta)) n.delete(pasta)
      else n.add(pasta)
      return n
    })

  const adicionar = () => {
    const escolhidos = novos.filter((p) => marcados.has(p.pasta))
    for (const p of escolhidos) {
      const variacoes = escolherSugestoes(p).map(variacaoDe)
      criarApp(grupo.id, { nome: p.nome, pasta: p.pasta, variacoes, variacaoPadrao: variacoes[0]?.id })
    }
    avisar(escolhidos.length === 1 ? `${escolhidos[0]!.nome} entrou em ${grupo.nome}.` : `${escolhidos.length} apps entraram em ${grupo.nome}.`)
    abrirDialogo(null)
  }

  return (
    <Dialogo
      titulo={`Apps em ${grupo.pasta}`}
      subtitulo="Os projetos da pasta que ainda não estão no launcher. Depois dá para trocar nome, foto e variações de cada um."
      aoFechar={() => abrirDialogo(null)}
      aoEnviar={adicionar}
      largura="44rem"
      rodape={
        <>
          <span className="text-legenda text-texto-3">{marcados.size > 0 ? `${marcados.size} marcados` : ''}</span>
          <button type="button" className="botao-2 ml-auto" onClick={() => abrirDialogo(null)}>
            Fechar
          </button>
          <button type="submit" className="botao" disabled={marcados.size === 0}>
            Adicionar {marcados.size === 1 ? '1 app' : `${marcados.size} apps`}
          </button>
        </>
      }
    >
      {erro && <p className="text-apoio text-erro">{erro}</p>}
      {!projetos && !erro && <p className="text-apoio text-texto-3">Procurando projetos…</p>}
      {projetos && novos.length === 0 && (
        <p className="py-4 text-apoio text-texto-2">Nenhum projeto novo: todos os da pasta já estão no launcher.</p>
      )}

      {novos.length > 0 && (
        <ul className="divide-y divide-linha border-y border-linha">
          {novos.map((p) => {
            const variacoes = escolherSugestoes(p)
            return (
              <li key={p.pasta}>
                <label className="flex cursor-pointer items-center gap-4 py-3">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--destaque)]"
                    checked={marcados.has(p.pasta)}
                    onChange={() => alternar(p.pasta)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.nome}</span>
                    <span className="block truncate text-legenda text-texto-3">{descreverProjeto(p) || 'pasta'}</span>
                  </span>
                  <span className="max-w-[50%] truncate text-right font-mono text-codigo text-texto-3">
                    {variacoes.length > 0 ? variacoes.map((v) => v.nome).join(' · ') : 'sem script de dev'}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {existentes.length > 0 && (
        <p className="mt-4 text-legenda text-texto-3">Já no launcher: {existentes.map((p) => p.nome).join(', ')}.</p>
      )}
    </Dialogo>
  )
}
