"""Gera src-tauri/icons/fonte.png: o símbolo da marca (V em papel, chapéu no ciano) sobre a tinta,
num quadrado arredondado. Os polígonos são os do simbolo-negativo.svg do pacote da marca
(viewBox 58.66 x 78.68). Depois: pnpm tauri icon src-tauri/icons/fonte.png
"""
from pathlib import Path
from PIL import Image, ImageDraw

LADO = 1024
ESCALA = 4  # desenha grande e reduz, para as bordas saírem suaves
TINTA = (32, 30, 29, 255)
PAPEL = (243, 242, 242, 255)
CIANO = (0, 136, 176, 255)

CHAPEU = [(11.09, 18.24), (29.33, 0), (47.57, 18.24), (39.09, 18.24), (29.33, 8.48), (19.57, 18.24)]
V = [(0, 32.24), (10.66, 32.24), (29.33, 61.8), (48, 32.24), (58.66, 32.24), (29.33, 78.68)]

grande = LADO * ESCALA
img = Image.new("RGBA", (grande, grande), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, grande - 1, grande - 1], radius=int(grande * 0.22), fill=TINTA)

altura = grande * 0.62  # o símbolo ocupa 62% da altura
k = altura / 78.68
largura = 58.66 * k
x0 = (grande - largura) / 2
y0 = (grande - altura) / 2

def pontos(poligono):
    return [(x0 + x * k, y0 + y * k) for x, y in poligono]

d.polygon(pontos(CHAPEU), fill=CIANO)
d.polygon(pontos(V), fill=PAPEL)

saida = Path(__file__).resolve().parent.parent / "src-tauri" / "icons" / "fonte.png"
img.resize((LADO, LADO), Image.LANCZOS).save(saida)
print(saida)
