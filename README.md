# 🎰 Mega-Sena IA – Dá para prever a loteria com Machine Learning?

![Python](https://img.shields.io/badge/Python-3.11%2B-blue)
![Machine Learning](https://img.shields.io/badge/Machine%20Learning-Gradient%20Boosting-green)
![Status](https://img.shields.io/badge/Status-Ativo-orange)
![License](https://img.shields.io/badge/License-Educational-lightgrey)
![Dataset](https://img.shields.io/badge/Dataset-Mega--Sena-brightgreen)
[![Netlify](https://img.shields.io/badge/Deploy-Netlify-00C7B7?logo=netlify&logoColor=white)](https://loteriabruno.netlify.app)

🌐 **[loteriabruno.netlify.app](https://loteriabruno.netlify.app)**

Este repositório é um **experimento educacional de Machine Learning** sobre o histórico da **Mega-Sena**. Um modelo é treinado com o histórico de sorteios e depois **avaliado com rigor** contra baselines simples e contra a teoria da probabilidade. O resultado esperado, e confirmado pelos números, é que **nenhum modelo consegue prever os sorteios**.

> ⚠️ **Aviso importante**: Loterias são processos aleatórios. As combinações geradas aqui **não têm mais chance de sair** do que quaisquer outras. Use o projeto **exclusivamente para estudo de estatística e IA**.

---

## 📌 Visão Geral

O pipeline:

1. Atualiza e carrega todo o histórico de sorteios da Mega-Sena
2. Calcula estatísticas descritivas (frequência, par/ímpar, décadas, soma, consecutivos)
3. Constrói um dataset supervisionado por número e sorteio, **sem data leakage**
4. Treina um **Gradient Boosting** e o valida contra dois baselines (holdout 80/20 e walk-forward)
5. Gera combinações ponderadas pelas probabilidades do modelo e combinações "balanceadas"
6. Simula 4 estratégias de aposta nos últimos 500 sorteios e compara com o valor teórico

---

## 📂 Estrutura do Repositório

```bash
.
├── megasena/                       # Núcleo da análise (usado pela CLI e pelo build)
│   ├── data.py                     #   carga do CSV e matriz de ocorrências
│   ├── features.py                 #   engenharia de features (vetorizada)
│   ├── stats.py                    #   estatísticas descritivas
│   ├── model.py                    #   modelo, métricas, holdout e walk-forward
│   ├── combinations.py             #   jogos ponderados e balanceados
│   ├── strategies.py               #   estratégias vs. distribuição hipergeométrica
│   ├── results.py                  #   monta o dicionário do results.json
│   └── update.py                   #   baixa concursos novos da API da Caixa
├── tests/                          # Testes (pytest)
├── update_dataset.py               # Atualiza o CSV com os concursos mais recentes
├── mega3.py                        # CLI — análise completa no terminal
├── generate_results.py             # Gera results.json para a interface web
├── index.html                      # Interface web (dashboard)
├── netlify/functions/              # Função que dispara novo build no Netlify
├── .github/workflows/ci.yml        # CI: ruff + pytest
├── pyproject.toml                  # Configuração do ruff e do pytest
├── requirements.txt                # Dependências de execução (versões fixas)
├── requirements-dev.txt            # + dependências de desenvolvimento
├── lottery-br-mega-sena.csv        # Dataset histórico da Mega-Sena
└── netlify.toml                    # Configuração de deploy
```

---

## 📊 Dataset

**Arquivo:** `lottery-br-mega-sena.csv`, com todos os sorteios desde **1996-03-11** (concurso 1). A base original veio do Kaggle (até o concurso 2806) e é completada com a **API pública de resultados da Caixa**.

### Atualização automática

`update_dataset.py` consulta o último concurso na API, baixa os que faltam no CSV, valida cada um (6 dezenas únicas entre 1 e 60, número do concurso esperado) e acrescenta ao arquivo. O build do Netlify roda esse script antes da análise, então **cada build usa os sorteios mais recentes**. Se a API estiver fora do ar, o CSV atual é mantido e o build segue normalmente.

Cada linha tem `DrawDate` (data do sorteio) e `Ball1` a `Ball6` (números sorteados, 1 a 60). Os dados são ordenados por `DrawDate`.

---

## 🧮 Engenharia de Features

Para **cada número de 1 a 60**, em **cada sorteio**, as features usam apenas os sorteios anteriores:

| Feature         | Descrição                                                        |
| --------------- | ---------------------------------------------------------------- |
| `atraso`        | Sorteios desde a última vez que o número apareceu                |
| `paridade`      | 1 se o número for par, 0 se ímpar                                |
| `freq_relativa` | Frequência acumulada até o sorteio anterior                      |
| `decada`        | Faixa do número: 0=1-10, 1=11-20, ... 5=51-60                    |
| `freq_recente`  | Aparições nos últimos 20 sorteios                                |

`paridade` e `decada` são fixas para cada número: na prática, dão ao modelo a identidade do número.

**Alvo (`y`)**: 1 se o número saiu naquele sorteio, 0 caso contrário (classificação binária, taxa base 6/60 = 10%).

---

## 🧠 Modelo

```python
GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42)
```

---

## 🔬 Validação

O modelo é comparado com dois baselines que não aprendem nada:

* **Constante**: probabilidade 6/60 = 0,1 para todo número
* **Frequência histórica**: probabilidade = frequência acumulada do número até o sorteio anterior

As métricas são **AUC-ROC**, **log loss** e **Brier score**. Menores log loss e Brier são melhores, e AUC 0,5 significa nenhum poder preditivo. A avaliação é feita de dois jeitos:

* **Holdout temporal 80/20**: treina nos primeiros 80% dos sorteios e testa nos 20% finais
* **Walk-forward (5 folds, janela expansiva)**: a partir da metade do histórico, cada fold treina com todo o passado e testa no bloco seguinte. O resultado é a média ± desvio

Resultado atual: o modelo tem AUC ≈ 0,50 e **log loss pior que os dois baselines**. Ele não supera nem a regra "todo número tem 10% de chance".

---

## 🎯 Estratégias vs. Teoria

Nos últimos 500 sorteios, cada estratégia escolhe 6 números **antes** de cada sorteio:

* **Aleatória**: 6 números ao acaso
* **Quentes / Frias**: os 6 mais e os 6 menos sorteados até o sorteio anterior
* **Balanceada**: soma entre 110 e 230, 2 a 4 pares, no máximo 1 par consecutivo e pelo menos 3 décadas

A referência é a **distribuição hipergeométrica**: um jogo de 6 números acerta em média **6×6/60 = 0,6** números por sorteio, e a chance de 3 acertos é ≈ 0,99%. Para cada estratégia são mostrados a média observada com **intervalo de confiança de 95%** e as contagens esperadas de 3 acertos, quadra, quina e sena.

---

## 🌐 Interface Web

**👉 [loteriabruno.netlify.app](https://loteriabruno.netlify.app)**

A interface exibe:
- Top 10 combinações geradas pelo modelo e 10 combinações balanceadas
- Heatmap de frequência dos 60 números
- Estatísticas descritivas (par/ímpar, décadas, soma)
- Validação: AUC, tabela modelo × baselines e resumo do walk-forward
- Estratégias com IC 95% e linha do valor esperado
- Botão **"Atualizar Análise"**, que dispara um novo build com barra de progresso. Se o build passar de 10 minutos, a página avisa e reabilita o botão

O build roda `update_dataset.py` e depois `generate_results.py`, e leva cerca de 1 a 2 minutos.

---

## ▶️ Como Executar Localmente

```bash
pip install -r requirements.txt

# (opcional) Buscar os concursos mais recentes
python update_dataset.py

# Análise completa no terminal
python mega3.py

# Gerar dados para a interface web e servir localmente
python generate_results.py
python -m http.server 8080
```

### Desenvolvimento

```bash
pip install -r requirements-dev.txt
ruff check .
pytest
```

Os testes cobrem a ausência de data leakage nas features, a equivalência da versão vetorizada com a implementação original, as regras dos jogos balanceados, a distribuição hipergeométrica, a atualização do dataset (com a API simulada) e o formato do `results.json`. O CI (GitHub Actions, Python 3.11) roda ruff e pytest a cada push e PR.

---

## 📈 Exemplo de Saída (`mega3.py`, histórico até o concurso 3087)

```text
Walk-forward (5 folds, janela expansiva) - media +- desvio:
  Preditor                                    AUC         Log loss            Brier
  Modelo GradientBoosting          0.5013+-0.0094   0.3275+-0.0045   0.0904+-0.0007
  Baseline constante (6/60)        0.5000+-0.0000   0.3251+-0.0000   0.0900+-0.0000
  Baseline frequencia historica    0.5062+-0.0072   0.3252+-0.0002   0.0900+-0.0000

TOP 10 COMBINACOES GERADAS
#1    | [4, 6, 27, 30, 34, 48]             | score: 0.1034
#2    | [28, 32, 34, 38, 42, 59]           | score: 0.1031
...
```

O `score` é a média das probabilidades estimadas pelo modelo para os 6 números, próxima da taxa base de 0,10.

---

## 🧪 Limitações e Conclusões

* Cada sorteio é independente: o histórico não carrega informação sobre o próximo
* O modelo não supera baselines triviais, nem no holdout nem no walk-forward
* Nenhuma estratégia se afasta do valor teórico de forma consistente. Com várias estratégias testadas, um desvio isolado do IC 95% é esperado por acaso

---

## 🚀 Possíveis Melhorias Futuras

* Build agendado após cada sorteio (quartas e sábados)
* Comparação com outros modelos (XGBoost, Random Forest, Redes Neurais)

---

## 🏷️ Tags

`#MachineLearning` `#DataScience` `#Python` `#ScikitLearn` `#Loteria` `#MegaSena` `#IA` `#Estatística` `#GradientBoosting`

---

## 📜 Licença

Projeto de caráter **educacional e experimental**. Uso livre para estudo e aprendizado.

---

👨‍💻 Desenvolvido para fins de estudo em **IA aplicada a dados reais**.
