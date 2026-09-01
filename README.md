# Lab

A small GitHub Pages site for learning HTML and sharing ideas.

- Vanilla HTML / CSS / JS. No build step.
- No live trading. No API keys. No secrets in the page.
- Sample ideas in `data/ideas.json` are marked **Example**.

## Local

Open `index.html` in a browser, or from this folder:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Update ideas

Edit `data/ideas.json` and push. The “Add” form on the page only stores ideas in the visitor’s browser (`localStorage`).

## Experiments

Optional later work can live under `experiments/`. Keep the home page generic.

## Pages

Settings → Pages → Deploy from branch `main` / root (or `/docs` if you move files).
