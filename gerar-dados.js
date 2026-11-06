
const fs = require("fs");
const path = require("path");

const PASTA = __dirname;
const ARQUIVO_CSV = path.join(PASTA, "breast-cancer-wisconsin.csv");


function lerCSV(caminho) {
  const linhas = fs.readFileSync(caminho, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const cabecalho = linhas[0].split(",").map((c) => c.trim());
  const registros = linhas.slice(1).map((l) => l.split(",").map((v) => v.trim()));

  const iDiag = cabecalho.indexOf("diagnosis");
  if (iDiag < 0) throw new Error("O CSV precisa ter a coluna 'diagnosis' (M ou B).");

  
  const colunas = cabecalho
    .map((nome, i) => ({ nome, i }))
    .filter(({ nome, i }) => i !== iDiag && nome !== "id" && nome !== "" &&
      registros.every((r) => r[i] !== "" && Number.isFinite(Number(r[i]))));

  return {
    nomes: colunas.map((c) => c.nome),
    X: registros.map((r) => colunas.map((c) => Number(r[c.i]))),
    maligno: registros.map((r) => (r[iDiag] === "M" ? 1 : 0))
  };
}

function criarSorteio(semente) {
  let s = semente >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar(lista, sorteio) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


function separarTreinoTeste(y, proporcaoTeste, sorteio) {
  const treino = [];
  const teste = [];
  [0, 1].forEach((classe) => {
    const indices = embaralhar(y.map((v, i) => (v === classe ? i : -1)).filter((i) => i >= 0), sorteio);
    const nTeste = Math.round(indices.length * proporcaoTeste);
    teste.push(...indices.slice(0, nTeste));
    treino.push(...indices.slice(nTeste));
  });
  return { treino, teste };
}


function ajustarPadronizacao(X) {
  const d = X[0].length;
  const media = new Array(d).fill(0);
  const desvio = new Array(d).fill(0);
  X.forEach((linha) => linha.forEach((v, j) => (media[j] += v / X.length)));
  X.forEach((linha) => linha.forEach((v, j) => (desvio[j] += (v - media[j]) ** 2 / X.length)));
  return { media, desvio: desvio.map((v) => Math.sqrt(v) || 1) };
}

const padronizar = (X, p) => X.map((linha) => linha.map((v, j) => (v - p.media[j]) / p.desvio[j]));


const sigmoide = (z) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

function treinar(X, y, { taxa = 0.1, iteracoes = 3000 } = {}) {
  const n = X.length;
  const lambda = 1 / n; 
  const d = X[0].length;
  const w = new Array(d).fill(0);
  let b = 0;
  for (let it = 0; it < iteracoes; it++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * X[i][j];
      const erro = sigmoide(z) - y[i];
      for (let j = 0; j < d; j++) gw[j] += erro * X[i][j];
      gb += erro;
    }
    for (let j = 0; j < d; j++) w[j] -= taxa * (gw[j] / n + lambda * w[j]);
    b -= (taxa * gb) / n;
  }
  return { w, b };
}

const probabilidade = (modelo, linha) =>
  sigmoide(modelo.b + linha.reduce((soma, v, j) => soma + v * modelo.w[j], 0));

// ---------- 5) Rodar tudo ----------
const { nomes, X, maligno } = lerCSV(ARQUIVO_CSV);
const sorteio = criarSorteio(42);
const { treino, teste } = separarTreinoTeste(maligno, 0.3, sorteio);

const pad = ajustarPadronizacao(treino.map((i) => X[i]));
const Xtreino = padronizar(treino.map((i) => X[i]), pad);
const Xteste = padronizar(teste.map((i) => X[i]), pad);
const modelo = treinar(Xtreino, treino.map((i) => maligno[i]));

const probTeste = Xteste.map((linha) => probabilidade(modelo, linha));
const acertos = probTeste.filter((p, k) => (p >= 0.5 ? 1 : 0) === maligno[teste[k]]).length;
const acuracia = acertos / teste.length;


const iRaio = nomes.indexOf("radius_mean");
if (iRaio < 0) throw new Error("O CSV precisa ter a coluna 'radius_mean'.");

const total = X.length;
const nMaligno = maligno.reduce((a, b) => a + b, 0);
const nBenigno = total - nMaligno;
const arred = (v, casas) => Math.round(v * 10 ** casas) / 10 ** casas;
const raios = X.map((linha) => linha[iRaio]);
const mediaRaio = (alvo) => {
  const lista = raios.filter((_, i) => maligno[i] === alvo);
  return lista.reduce((a, b) => a + b, 0) / lista.length;
};


const limites = [0, 10, 12, 14, 16, 18, 20, Infinity];
const nomesFaixas = ["< 10", "10–12", "12–14", "14–16", "16–18", "18–20", "≥ 20"];
const faixas = nomesFaixas.map((nome, k) => {
  const idx = raios.map((r, i) => i).filter((i) => raios[i] >= limites[k] && raios[i] < limites[k + 1]);
  return { nome, n: idx.length, pct: idx.length ? (idx.filter((i) => maligno[i]).length / idx.length) * 100 : 0 };
}).filter((f) => f.n > 0);

const dados = {
  fonte: "Breast Cancer Wisconsin (Diagnostic) - UCI / Kaggle",
  total_casos: total,
  modelo: {
    tipo: "Regressão logística feita em JavaScript (dados tabulares, não analisa imagens)",
    acuracia_teste: arred(acuracia * 100, 1)
  },
  pizza: { rotulos: ["Benigno", "Maligno"], valores: [nBenigno, nMaligno] },
  barras: {
    rotulos: ["Benigno", "Maligno"],
    valores: [arred(mediaRaio(0), 2), arred(mediaRaio(1), 2)],
    unidade: "raio médio das células (unidades do dataset)"
  },
  linha: {
    rotulos: faixas.map((f) => f.nome),
    valores: faixas.map((f) => arred(f.pct, 1)),
    contagem: faixas.map((f) => f.n),
    unidade: "% de casos malignos"
  },
  faixas: nomesFaixas
};


const sorteados = embaralhar(teste.map((_, k) => k), criarSorteio(7)).slice(0, 40);
const casos = sorteados.map((k, n) => ({
  codigo: `C-${String(n + 1).padStart(4, "0")}`,
  probabilidadeIA: arred(probTeste[k], 3),
  raioMedio: arred(X[teste[k]][iRaio], 2),
  status: "aguardando",
  parecerMedico: ""
}));


const salvar = (nome, texto) => fs.writeFileSync(path.join(PASTA, nome), texto, "utf8");
const json = (obj) => JSON.stringify(obj, null, 2);

salvar("dados.json", json(dados));
salvar("dados.js", "window.DADOS = " + json(dados) + ";\n");
salvar("casos_seed.json", json(casos));
salvar("casos_seed.js", "const CASOS_SEED = " + json(casos) + ";\n");

console.log(`Total de casos: ${total} (benignos: ${nBenigno}, malignos: ${nMaligno})`);
console.log(`Medidas usadas pelo modelo: ${nomes.length}`);
console.log(`Treino: ${treino.length} casos | Teste: ${teste.length} casos`);
console.log(`Acurácia no conjunto de teste: ${(acuracia * 100).toFixed(1)}%`);
console.log("Arquivos gerados: dados.js, dados.json, casos_seed.js, casos_seed.json");
