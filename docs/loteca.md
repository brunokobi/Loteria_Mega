# Loteca: metodologia e resultados

Este documento descreve como a página `loteca.html` calcula as probabilidades, como o modelo foi testado e quais são os limites de cada fonte de dados.

## Fontes de dados

| Fonte | O que traz | Arquivo / módulo | Custo |
|---|---|---|---|
| API de resultados da Caixa | Todos os concursos desde 2002: 14 jogos, times, UF e placar | `loteca.csv` · `loteca/update.py` | Grátis, sem cadastro |
| [football-data.co.uk](https://www.football-data.co.uk) | Odds de fechamento (Pinnacle, Bet365, média do mercado) das ligas europeias desde 2002/03 e da Série A desde 2012 | `loteca_odds.csv` · `loteca/odds_history.py` | Grátis, CSV |
| [OddsPapi](https://oddspapi.io) | Odds da Pinnacle dos jogos dos próximos 14 dias, inclusive estaduais e Série B | `loteca/live.py` | Plano grátis (250 requisições); ~6 por build |
| Programação da Caixa | Os 14 jogos dos concursos abertos | `loteca/live.py::fetch_programacao` | Grátis, sem cadastro |

A **programação dos próximos concursos** vem de `https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca/programacao`: os 14 jogos de cada concurso aberto, com data, prazo e horário final das apostas e prêmio estimado. A página mostra só esses jogos.

Ordem das fontes para a programação:

1. o build consulta a Caixa e casa cada jogo com o Elo e com as odds da semana;
2. se a Caixa não responder no build, usa a programação publicada no deploy anterior (se as apostas ainda estiverem abertas);
3. o navegador também consulta a Caixa (a API permite CORS) e, se o concurso for diferente do publicado, monta os jogos sozinho com as tabelas de times (`team_lookup`), o Elo e as odds do `loteca.json` (`LotecaModel.roundsFromCaixa` em `src/loteca/model.ts`).

> A normalização de nomes de times existe em dois lugares: `loteca/live.py::normalize_name` (build) e `src/loteca/model.ts::normalizeName` (navegador). Se mudar uma, mude a outra, ou o navegador deixa de achar os times que o build acha.

### Bloqueio da Caixa fora do Brasil

A API da Caixa responde **HTTP 403** para servidores fora do Brasil, como os do build do Netlify (confirmado em novembro de 2026). Efeitos na Loteca:

* **Programação e data do concurso:** o navegador do visitante consulta a Caixa direto, então a página mostra os 14 jogos certos.
* **Histórico (`loteca.csv`) e Elo:** não há espelho público da Loteca, então o build não baixa concursos novos. Para atualizar, rode numa máquina no Brasil `python -m loteca.update` e faça push; o próximo build recalcula o Elo e o teste.

### Problemas conhecidos nos dados da Caixa

* Jogos com resultado **sorteado** (partida não realizada) vêm sem data; usamos a data de apuração e esses jogos **não atualizam o Elo**.
* Dez concursos antigos (244, 245, 393, 727, 770, 778–781, 786) vêm com jogos faltando; os jogos existentes entram no Elo, mas o concurso fica fora da contagem de acertos por concurso.
* O mesmo clube aparece com grafias diferentes ao longo dos anos (`VASCO` / `VASCO DA GAMA`, `ATH. BILBAO` / `ATHLETIC BILBAO`). `loteca/data.py::merge_name_variants` unifica nomes da mesma UF quando um só acrescenta palavras genéricas ao outro (`CLUBE`, `ESPORTE`, `CALCIO`…) **e os dois nunca aparecem no mesmo concurso**. Cidades e siglas não unificam de propósito (`PORTUGUESA` ≠ `PORTUGUESA SANTISTA`): é melhor dividir um clube em dois do que misturar dois clubes.

## Modelo

### Elo

Cada time começa com 1500 pontos. Jogo a jogo, em ordem cronológica:

* `diff = rating_mandante + vantagem_de_mando − rating_visitante`
* resultado esperado do mandante: `1 / (1 + 10^(−diff/400))`
* o vencedor ganha `K × peso_gols × (resultado − esperado)` pontos e o perdedor perde o mesmo; o peso pela diferença de gols segue o World Football Elo (1; 1,5; (11+n)/8)

`K` e a vantagem de mando são escolhidos por busca em grade (`K ∈ {10, 20, 30, 40, 60}`, mando `∈ {0, 30, 60, 90, 120}`) minimizando o log loss numa validação **dentro** do período de ajuste. Resultado atual: `K = 20`, mando = 30.

### De Elo para probabilidade

Uma regressão logística multinomial transforma o Elo em P(1), P(X), P(2), com três variáveis: diferença de Elo, indicador de "time novo" (menos de 10 jogos no histórico) e a interação entre as duas. O indicador faz o modelo confiar menos em times com pouco histórico. Os coeficientes vão no `loteca.json`, e o navegador recalcula com a mesma fórmula a probabilidade dos jogos que ele monta a partir da Caixa (`LotecaModel.eloProbs` em `src/loteca/model.ts`).

### Odds

As odds decimais de 1, X e 2 viram probabilidade pelo inverso, normalizado para somar 1 (remove a margem da casa, de 6% a 7% na Pinnacle). No histórico, a preferência é: Pinnacle de fechamento → Pinnacle → média do mercado → Bet365.

### Casamento Caixa × football-data

`loteca/matching.py` liga cada jogo da Caixa ao jogo correspondente do football-data quando:

1. o país bate (UF brasileira → Brasil; `ING`, `ESP`, `ITA`, `FRA`, `DEU`, `NLD`, `PRT`);
2. a data está entre −1 e +1 dia (fuso horário);
3. **o placar é idêntico** nas duas fontes;
4. a similaridade dos nomes (após limpeza, apelidos e traduções) é ≥ 0,6 para os dois times, sem empate com outro candidato.

Casam ~85% dos jogos europeus e 24% dos brasileiros (Série A desde 2012; estaduais e divisões inferiores não têm odds grátis). Nos concursos recentes, ~42% dos jogos têm odds históricas.

## Teste no passado

* **Aquecimento:** os 100 primeiros concursos só alimentam o Elo.
* **Ajuste:** concursos 101 a 641 (escolha de K, mando e da regressão logística).
* **Teste:** concursos 642 a 1283, nunca usados para escolher nada. Cada jogo é previsto só com os resultados anteriores a ele.

### Acertos por concurso (aposta simples, 14 jogos)

| Estratégia | Acertos / concurso | Acerto por jogo | Concursos com 10+ |
|---|---|---|---|
| Odds quando houver, senão Elo | **7,02** | — | — |
| Elo | 6,87 | 49,0% | 48 |
| Sempre o mandante | 6,44 | 46,0% | 28 |
| Chute aleatório | 4,67 | 33,4% | 5 |

### Nos ~4 mil jogos de teste com odds históricas

| Preditor | Acerto | Log loss | Brier |
|---|---|---|---|
| **Odds (Pinnacle, sem margem)** | **52,8%** | **0,984** | **0,587** |
| Elo + odds combinados | 52,2% | 0,985 | 0,588 |
| Elo | 50,1% | 1,019 | 0,611 |

As odds já incorporam o que o Elo sabe (e notícias, lesões e escalações): a combinação não melhora as odds sozinhas. Por isso a página usa odds quando existem e o Elo só como reserva.

### Calibração do Elo

Quando o Elo dá 42,6% para o palpite, o resultado acontece 42,5% das vezes. Nos palpites de alta confiança (> 70%) ele exagera um pouco: prevê 76% e acontece 69%.

Os números acima são do teste rodado em novembro de 2026; a página mostra sempre os valores do último build.

## Montador de aposta

Para cada um dos 14 jogos há três opções: simples (resultado mais provável), duplo (os dois mais prováveis) ou triplo. Dado o número de duplos e triplos escolhido, uma programação dinâmica distribui as marcações extras para **maximizar a probabilidade de acertar todos os jogos** (produto das probabilidades cobertas). A chance de 13 ou mais acertos vem da distribuição de Poisson-binomial das coberturas. O cálculo roda no navegador (`optimize` e `hitDistribution` em `src/loteca/builder.ts`).

Preço usado: **R$ 2,00 por combinação** (aposta mínima de R$ 4,00 com 1 duplo; máximo de 5 duplos e 3 triplos). Os valores vêm de notícias de 2026 e podem mudar: estão em `loteca/results.py::PRICING` e a página pede para conferir na Caixa.

## Histórico das previsões

`loteca/registry.py` mantém `loteca_registro.json`:

1. **Registro:** para cada concurso aberto da programação, grava os 14 jogos com as probabilidades (odds quando o jogo tem, senão Elo), a fonte e o palpite (resultado mais provável). Só registra se todos os jogos tiverem previsão.
2. **Atualização até o prazo:** enquanto as apostas estão abertas, a previsão é atualizada a cada execução (as odds mudam durante a semana); `first_registered_at` guarda o primeiro registro e `registered_at` a última atualização. **Depois do prazo, a previsão fica congelada.**
3. **Conferência:** quando o concurso entra no `loteca.csv`, calcula acertos, % de acerto, log loss e Brier, e quantos acertos vieram de jogos com odds.

### Como rodar

A API da Caixa bloqueia servidores fora do Brasil (o build do Netlify e, ao que tudo indica, o GitHub Actions), então o registro roda numa máquina no Brasil:

```bash
# uma vez: chave da OddsPapi e caminho do Python num arquivo local (fora do repositório)
mkdir -p ~/.config/loteca
cat > ~/.config/loteca/env <<'CFG'
ODDSPAPI_KEY=sua-chave
PYTHON=/caminho/para/venv/bin/python
CFG
chmod 600 ~/.config/loteca/env

# cada execução: atualiza o histórico, registra, confere, faz commit e push
./scripts/registrar_loteca.sh
```

Sem `ODDSPAPI_KEY`, o script **só atualiza o histórico e confere**: não registra previsões, para não sobrescrever as que têm odds por versões só com Elo. Como o "último concurso" da API demora a mudar depois da apuração, a atualização também tenta os 2 números seguintes, e só aceita concursos com data de apuração.

**Agendamento sugerido** (sexta à noite e sábado de manhã para registrar com as odds mais recentes; terça para conferir): 3 execuções por semana. Cada execução que publica algo gasta ~6 requisições da OddsPapi no script e ~6 no build do Netlify, ~150 por mês, dentro das 250 do plano grátis.

* **Linux/WSL (cron):** `crontab -e` e
  ```
  0 20 * * 5   /home/bruno/Loteria_Mega/scripts/registrar_loteca.sh >> ~/loteca.log 2>&1
  0 10 * * 6,2 /home/bruno/Loteria_Mega/scripts/registrar_loteca.sh >> ~/loteca.log 2>&1
  ```
  (no WSL, o cron só roda com o WSL aberto).
* **Windows (Agendador de Tarefas):** ação `wsl.exe` com os argumentos
  `-d Ubuntu-24.04 -- bash -lc "/home/bruno/Loteria_Mega/scripts/registrar_loteca.sh >> ~/loteca.log 2>&1"`.

Se a máquina estiver desligada no horário, o concurso pode ficar sem registro antes do prazo; a conferência dos anteriores acontece na execução seguinte (e o navegador do visitante já confere sozinho os concursos jogados).

## Limites

* Acertar mais jogos **não torna a aposta lucrativa**: a Caixa retém parte da arrecadação e o prêmio é dividido entre os ganhadores.
* Estaduais e Série B não têm odds históricas grátis; o teste das odds cobre principalmente ligas europeias e Série A.
* O Elo de times europeus é pouco confiável: eles aparecem pouco na Loteca. Nos jogos com odds isso não importa.
* Seleções: a OddsPapi traz os nomes em inglês e a Caixa em português, então o Elo não casa com esses jogos (as odds continuam valendo).

## Como reproduzir

```bash
python -m loteca.update          # concursos novos da Loteca
python -m loteca.odds_history    # odds históricas (~5 min, ~280 arquivos)
python -m loteca.backtest        # teste do Elo (JSON)
ODDSPAPI_KEY=... python generate_loteca.py   # loteca.json completo

# ver a página localmente
npm install && npm run build     # compila o TypeScript para dist/
python -m http.server 8080       # http://localhost:8080/loteca.html
```
