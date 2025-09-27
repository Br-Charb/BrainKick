Favicon setup

To show your app's logo in the browser tab (favicon), place your logo file where Vite will serve it and ensure `index.html` references it.

Recommended locations:
- client/public/favicon.png  (Vite serves files in `public/` at the root)
- or client/favicon.png      (served by Vite from project root)

If you have a PNG at the repo root named `BrainKickLogo.png`, copy it into the client public folder:

# from Windows PowerShell (run in project root)
cp "BrainKickLogo.png" "client/public/favicon.png"

# or from WSL (if file is on /mnt/c/...)
cp '/mnt/c/Programming Files/BrainKick/BrainKickLogo.png' '/mnt/c/Programming Files/BrainKick/client/public/favicon.png'

Notes:
- Browsers prefer .ico files for best compatibility. You can generate a favicon.ico from a PNG using online tools or the `convert` command (ImageMagick):
  convert favicon.png -resize 64x64 favicon.ico

- After copying, restart the dev server (or refresh the page and clear cache) to see the favicon.
