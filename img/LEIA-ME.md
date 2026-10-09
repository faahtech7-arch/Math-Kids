# Imagens do projeto

## Logo da universidade (tela de Créditos)

Salve o arquivo **oficial** da logo da Universidade Cruzeiro do Sul aqui nesta
pasta, com um destes nomes:

| Ordem de preferência | Nome do arquivo |
|---|---|
| 1º | `cruzeiro-do-sul.svg` |
| 2º | `cruzeiro-do-sul.png` |
| 3º | `cruzeiro-do-sul.jpg` |

`js/creditos.js` testa os três nessa ordem e usa o primeiro que existir.
**SVG é o melhor** para a apresentação: não fica borrado no projetor nem em
tela grande. PNG com fundo transparente é a segunda melhor opção.

Assim que o arquivo estiver aqui, a logo aparece sozinha na tela de Créditos —
não precisa mexer em código. Enquanto não estiver, a tela mostra o nome da
universidade em texto e continua funcionando normalmente (não aparece ícone de
imagem quebrada).

A logo é renderizada com no máximo 230px de largura e 76px de altura,
mantendo a proporção original.
