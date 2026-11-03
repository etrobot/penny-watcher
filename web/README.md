# Penny Watcher — web (presentation layer)

Fintech-style dashboard for the Python backtest in the project root.
Built with the TanStack stack:

- **TanStack Router** — pages: Overview, Signals, Combos, Sectors, Explosions, Method
- **TanStack Query** — loads `public/data.json`
- **TanStack Table** — every sortable / searchable / paginated table
- Vite + React 19 + Tailwind CSS 4

The Python side is the analysis layer and stays the source of truth:

```bash
# from the project root — regenerate the data the site renders
python3 export_web_data.py   # output/*.csv -> web/public/data.json

# then run the site
cd web
bun install   # or npm install
bun run dev   # or npm run dev
bun run build # production build into dist/
```

Never edit numbers in the front end. If a figure is wrong, fix the
Python, re-run the exporter.
