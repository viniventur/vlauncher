// Criar ou editar um grupo: nome, foto e a pasta onde ficam os projetos dele (opcional; com ela, o
// launcher acha os apps que ainda não estão no grupo).

import { FolderOpen, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { useConfig } from '../lib/config'
import { descartarDoApp } from '../lib/execucoes'
import { caminhoWindows, nomeDaPasta } from '../lib/texto'
import { useUi } from '../lib/ui'
import { CampoImagem } from './CampoImagem'
import { Dialogo } from './Dialogo'

const comMaiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export function DialogoGrupo({ id, pasta: pastaInicial, depoisImportar }: { id?: string; pasta?: string; depoisImportar?: boolean }) {
  const grupo = useConfig((s) => s.config.grupos.find((g) => g.id === id))
  const { criarGrupo, editarGrupo, removerGrupo } = useConfig.getState()
  const abrirDialogo = useUi((s) => s.abrirDialogo)

  const [nome, setNome] = useState(grupo?.nome ?? (pastaInicial ? comMaiuscula(nomeDaPasta(pastaInicial)) : ''))
  const [pasta, setPasta] = useState(grupo?.pasta ?? pastaInicial ?? '')
  const [imagem, setImagem] = useState(grupo?.imagem)
  const [ajuste, setAjuste] = useState(grupo?.ajuste ?? 'preencher')

  const fechar = () => {
    if (imagem && imagem !== grupo?.imagem) api.removerImagem(imagem).catch(() => undefined)
    abrirDialogo(null)
  }

  const salvar = () => {
    if (!nome.trim()) return
    const dados = { nome: nome.trim(), pasta: caminhoWindows(pasta) || undefined, imagem, ajuste }
    if (grupo) {
      editarGrupo(grupo.id, dados)
      abrirDialogo(null)
    } else {
      const novo = criarGrupo(dados)
      abrirDialogo(depoisImportar && dados.pasta ? { tipo: 'importar', grupoId: novo } : null)
    }
  }

  const escolherPasta = async () => {
    try {
      const p = await api.escolherPasta('Pasta dos projetos do grupo', pasta || undefined)
      if (!p) return
      setPasta(p)
      if (!nome.trim()) setNome(comMaiuscula(nomeDaPasta(p)))
    } catch (e) {
      avisarErro(e)
    }
  }

  const remover = async () => {
    if (!grupo) return
    const n = grupo.apps.length
    const aviso = n > 0 ? `O grupo ${grupo.nome} e os ${n} apps dele saem do launcher (as pastas ficam como estão).` : `O grupo ${grupo.nome} sai do launcher.`
    if (await api.confirmar(aviso, 'Remover grupo', 'Remover')) {
      descartarDoApp(...grupo.apps.map((a) => a.id))
      removerGrupo(grupo.id)
      abrirDialogo(null)
    }
  }

  return (
    <Dialogo
      titulo={grupo ? 'Editar o grupo' : 'Novo grupo'}
      aoFechar={fechar}
      aoEnviar={salvar}
      largura="36rem"
      rodape={
        <>
          {grupo && (
            <button type="button" className="botao-2 pequeno mr-auto border-transparent text-erro hover:border-current" onClick={remover}>
              <Trash2 className="size-3.5" /> Remover
            </button>
          )}
          <button type="button" className="botao-2 ml-auto" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="botao" disabled={!nome.trim()}>
            {grupo ? 'Salvar' : depoisImportar && pasta.trim() ? 'Criar e procurar apps' : 'Criar grupo'}
          </button>
        </>
      }
    >
      <div className="grid gap-5">
        <label className="block">
          <span className="rotulo">Nome</span>
          <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Trabalho" required />
        </label>

        <div>
          <span className="rotulo">Pasta dos projetos (opcional)</span>
          <div className="flex gap-2">
            <input className="campo" value={pasta} onChange={(e) => setPasta(e.target.value)} placeholder="D:\projetos\trabalho" />
            <button type="button" className="botao-2 shrink-0" onClick={escolherPasta}>
              <FolderOpen className="size-4" /> Escolher
            </button>
          </div>
          <p className="mt-1.5 text-legenda text-texto-3">Com ela, o grupo acha os projetos novos que você criar lá.</p>
        </div>

        <div>
          <span className="rotulo">Foto</span>
          <CampoImagem
            nome={nome}
            imagem={imagem}
            original={grupo?.imagem}
            aoMudar={setImagem}
            ajuste={ajuste}
            aoAjustar={setAjuste}
            formato="quadrado"
          />
        </div>
      </div>
    </Dialogo>
  )
}
