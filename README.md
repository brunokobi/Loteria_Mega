# 🎰 Mega-Sena IA – Previsão de Combinações com Machine Learning

![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![Machine Learning](https://img.shields.io/badge/Machine%20Learning-Gradient%20Boosting-green)
![Status](https://img.shields.io/badge/Status-Ativo-orange)
![License](https://img.shields.io/badge/License-Educational-lightgrey)
![Dataset](https://img.shields.io/badge/Dataset-Mega--Sena-brightgreen)
[![Netlify](https://img.shields.io/badge/Deploy-Netlify-00C7B7?logo=netlify&logoColor=white)](https://loteriabruno.netlify.app)

🌐 **[loteriabruno.netlify.app](https://loteriabruno.netlify.app)**

Este repositório apresenta um **experimento educacional de Machine Learning** aplicado aos dados históricos da **Mega-Sena (loteria brasileira)**. O objetivo é **analisar padrões estatísticos** do histórico de sorteios e gerar **combinações de números com maior probabilidade relativa**, com base em um modelo treinado.

> ⚠️ **Aviso importante**: Loterias são processos aleatórios. Este projeto **não garante ganhos financeiros** e deve ser usado **exclusivamente para fins educacionais, estatísticos e de estudo em IA**.

---

## 📌 Visão Geral do Projeto

O script:

1. Carrega todo o histórico de sorteios da Mega-Sena
2. Constrói um dataset supervisionado baseado em **atraso dos números** e **paridade**
3. Treina um modelo de **Machine Learning (Gradient Boosting)**
4. Calcula probabilidades individuais para cada número (1 a 60)
5. Gera combinações ponderadas por probabilidade
6. Exibe as **10 melhores combinações** entre 100 geradas

---

## 📂 Estrutura do Repositório

```bash
.
├── mega3.py                        # Script CLI — análise completa no terminal
├── generate_results.py             # Gera results.json para a interface web
├── index.html                      # Interface web (dashboard)
├── favicon.svg                     # Favicon da aplicação
├── netlify.toml                    # Configuração de deploy (Netlify)
├── requirements.txt                # Dependências Python
├── lottery-br-mega-sena.csv        # Dataset histórico da Mega-Sena
└── README.md                       # Documentação do projeto
```

---

## 📊 Dataset Utilizado

**Arquivo:** `lottery-br-mega-sena.csv`

### Conteúdo do Dataset

<p align="left">
  <a href="https://www.kaggle.com" target="_blank">
    <img src="https://img.shields.io/badge/Dataset-Kaggle-20BEFF?logo=kaggle&logoColor=white" alt="Kaggle Dataset" />
  </a>
</p>

Cada linha representa um sorteio histórico da Mega-Sena, contendo:

* `DrawDate` → Data do sorteio
* `Ball1` a `Ball6` → Números sorteados (1 a 60)

### Pré-processamento

* Ordenação cronológica pelo campo `DrawDate`
* Uso de **100% do histórico disponível** (sem divisão treino/teste, por se tratar de análise estatística global)

---

## 🧠 Modelo de Machine Learning

### Algoritmo Utilizado

* **Gradient Boosting Classifier** (`sklearn.ensemble.GradientBoostingClassifier`)

### Por que Gradient Boosting?

* Excelente para dados tabulares
* Capaz de capturar padrões não-lineares
* Robusto contra overfitting moderado

---

## 🧮 Engenharia de Features

Para **cada número de 1 a 60**, em **cada sorteio**, são criadas as seguintes features (sem data leakage — estado computado antes do sorteio):

| Feature           | Descrição                                                       |
| ----------------- | --------------------------------------------------------------- |
| `atraso`          | Quantidade de sorteios desde a última vez que o número apareceu |
| `paridade`        | 1 se o número for par, 0 se ímpar                               |
| `freq_relativa`   | Frequência acumulada até o sorteio anterior                     |
| `decada`          | Faixa do número: 0=1-10, 1=11-20, ... 5=51-60                  |
| `freq_recente`    | Aparições nas últimas 20 jogadas                                |

### Variável Alvo (`y`)

* `1` → Número foi sorteado naquele concurso
* `0` → Número não foi sorteado

Isso transforma o problema em uma **classificação binária**: *qual a chance de um número aparecer no próximo sorteio?*

---

## ⚙️ Parâmetros do Modelo

```python
GradientBoostingClassifier(
    n_estimators=100,
    learning_rate=0.1,
    max_depth=3,
    random_state=42
)
```

---

## 🎯 Geração das Combinações

1. O modelo calcula a **probabilidade individual** de cada número (1–60)
2. São geradas **100 combinações únicas** de 6 números
3. A seleção é feita por **amostragem ponderada pelas probabilidades**
4. Cada jogo recebe um **score médio de probabilidade**
5. As **10 melhores combinações** são exibidas

---

## 🌐 Interface Web

Acesse a aplicação em produção:

**👉 [loteriabruno.netlify.app](https://loteriabruno.netlify.app)**

A interface exibe:
- Top 10 combinações com bolinhas animadas
- Heatmap de frequência dos 60 números
- Análise estatística (par/ímpar, décadas, soma)
- Validação temporal com AUC-ROC
- Botão **"Atualizar Análise"** para disparar novo build com barra de progresso em tempo real

---

## ▶️ Como Executar Localmente

### 1️⃣ Instalar Dependências

```bash
pip install -r requirements.txt
```

### 2️⃣ Script CLI (terminal)

```bash
python mega3.py
```

### 3️⃣ Gerar dados para a interface web

```bash
python generate_results.py
# Abre index.html em um servidor local:
python -m http.server 8080
```

---

## 📈 Exemplo de Saída

```text
🤖 IA TREINADA COM HISTÓRICO COMPLETO
#1    | [3, 11, 24, 36, 42, 58] | 0.6134
#2    | [5, 18, 27, 33, 44, 59] | 0.6098
...
```

---

## 🧪 Limitações Conhecidas

* Loterias são **processos estocásticos** — cada sorteio é independente
* O modelo **não prevê o futuro**, apenas explora padrões históricos
* AUC-ROC ≈ 0.5 confirma que o modelo não supera o baseline aleatório

---

## 🚀 Possíveis Melhorias Futuras

* Comparação com outros modelos (XGBoost, Random Forest, Redes Neurais)
* Validação com janela deslizante (walk-forward)
* Atualização automática do dataset com novos sorteios

---

## 🏷️ Tags

`#MachineLearning` `#DataScience` `#Python` `#ScikitLearn` `#Loteria` `#MegaSena` `#IA` `#Estatística` `#GradientBoosting`

---

## 📜 Licença

Projeto de caráter **educacional e experimental**. Uso livre para estudo e aprendizado.

---

👨‍💻 Desenvolvido para fins de estudo em **IA aplicada a dados reais**.
