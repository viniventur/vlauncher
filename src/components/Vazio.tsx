// O launcher sem nenhum grupo: começar por uma pasta de projetos (o caminho curto) ou por um grupo
// vazio.

import { FolderSearch, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { avisarErro } from '../lib/avisos'
import { useUi } from '../lib/ui'
import { Simbolo } from './Marca'

export function Vazio() {
  const abrirDialogo = useUi((s) => s.abrirDialogo)

  const daPasta = async () => {
    try {
      const pasta = await api.escolherPasta('Pasta dos projetos do grupo')
      if (pasta) abrirDialogo({ tipo: 'grupo', pasta, depoisImportar: true })
    } catch (e) {
      avisarErro(e)
    }
  }

  return (
    <div className="mx-auto grid max-w-[34rem] justify-items-start gap-6 py-[14vh]">
      <Simbolo className="h-16 w-auto" />
      <div>
        <h1 className="text-titulo">Nenhum grupo ainda.</h1>
        <p className="mt-3 text-texto-2">
          Um grupo junta os apps de um trabalho. Se os projetos ficam numa pasta só, como D:\projetos\trabalho, o launcher
          encontra os apps dela e já sugere como rodar cada um.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button className="botao" onClick={daPasta}>
          <FolderSearch className="size-4" /> Criar grupo de uma pasta
        </button>
        <button className="botao-2" onClick={() => abrirDialogo({ tipo: 'grupo' })}>
          <Plus className="size-4" /> Grupo vazio
        </button>
      </div>
    </div>
  )
}
