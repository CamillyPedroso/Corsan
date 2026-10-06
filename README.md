# EXOCS – Painel de Métricas

Site estático (HTML + CSS + JavaScript) que lê dados de uma planilha do Google Sheets e grava novos registros nela.
Não precisa instalar nada: basta publicar no GitHub Pages.

```
index.html              página principal
assets/app.js           lógica (aqui ficam os 2 links do Google)
assets/styles.css       visual
assets/sample-data.csv  dados de exemplo (usados enquanto a planilha não está conectada)
apps-script/Code.gs     código para colar no Google Apps Script (gravação)
.github/workflows/      publicação automática no GitHub Pages
```

## 1. Colocar o site no ar (GitHub Pages)

1. No GitHub, abra o repositório → **Settings** → **Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Faça o merge da branch de trabalho na `main` (ou envie os arquivos para a `main`).
4. Aba **Actions**: aguarde o fluxo "Publicar no GitHub Pages" ficar verde (~1 min).
5. O link do site será: `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/` — é só compartilhar.

**Para atualizar o site depois:** altere qualquer arquivo e envie para a `main`. O site republica sozinho.
(Pode editar direto no GitHub: abra o arquivo → ícone de lápis → *Commit changes*.)

## 2. Conectar a planilha (leitura)

1. Crie uma planilha no Google Sheets, renomeie a aba para **Dados** e cole na linha 1:
   `date, metric, value, target, category, status, note` (uma coluna por célula).
   Dica: copie as linhas de `assets/sample-data.csv` para ter dados de partida.
2. **Arquivo → Compartilhar → Publicar na web** → escolha a aba **Dados** e o formato **Valores separados por vírgula (.csv)** → **Publicar**.
3. Copie o link gerado e cole em `assets/app.js`:
   ```js
   const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/.../pub?gid=0&single=true&output=csv";
   ```

Qualquer alteração na planilha aparece no site ao clicar em **Atualizar** (o Google leva alguns minutos para refletir).

## 3. Gravar pelo site (escrita)

1. Na planilha: **Extensões → Apps Script**. Apague o conteúdo e cole o arquivo `apps-script/Code.gs`.
2. **Implantar → Nova implantação** → tipo **App da Web**:
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
3. Autorize quando pedir e copie a **URL do app da Web** (termina em `/exec`).
4. Cole em `assets/app.js`:
   ```js
   const APPS_SCRIPT_URL = "https://script.google.com/macros/s/.../exec";
   ```
5. Se mudar o código do Apps Script depois, use **Implantar → Gerenciar implantações → editar → Nova versão**.

> Atenção: com "Qualquer pessoa", quem tiver o link do site pode enviar registros para a planilha.
> Se o site for público, considere não divulgar o link do Apps Script e conferir a planilha com frequência.

## Testar localmente
Abra um terminal na pasta e rode `python3 -m http.server 8000`, depois acesse http://localhost:8000.
(Abrir o `index.html` com duplo clique não funciona, porque o navegador bloqueia a leitura do CSV.)
