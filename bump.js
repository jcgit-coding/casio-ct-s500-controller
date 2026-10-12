const fs = require('fs');

try {
    let html = fs.readFileSync('index.html', 'utf8');

    // Extract current version number
    const versionMatch = html.match(/var V='v(\d+)'/) || html.match(/id="appVersionBadge"[^>]*>v(\d+)/) || html.match(/\?v(\d+)/);
    if (!versionMatch) {
        console.error("No se pudo encontrar la versión actual.");
        process.exit(1);
    }

    const currentVersion = parseInt(versionMatch[1]);
    const requestedVersion = process.argv[2] ? parseInt(process.argv[2].replace(/^v/i, '')) : null;
    const newVersion = requestedVersion !== null && !isNaN(requestedVersion) ? requestedVersion : currentVersion + 1;

    // Generate formatted date (COT: America/Bogota)
    const now = new Date();
    const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    
    const cotDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const dayStr = days[cotDate.getDay()];
    const dateNum = String(cotDate.getDate()).padStart(2, '0');
    const monthStr = months[cotDate.getMonth()];
    const hours = String(cotDate.getHours()).padStart(2, '0');
    const minutes = String(cotDate.getMinutes()).padStart(2, '0');
    
    const newBadgeContent = `v${newVersion} &middot; ${dayStr} ${dateNum} ${monthStr} ${hours}:${minutes} &middot; COT`;

    // 1. Update var V='v...' in localStorage cache check
    html = html.replace(/var V='v\d+';/, `var V='v${newVersion}';`);

    // 2. Update badge content
    html = html.replace(/(<span id="appVersionBadge"[^>]*>)(.*?)(<\/span>)/, `$1${newBadgeContent}$3`);

    // 3. Update all ?v... cache busters in script and link tags
    html = html.replace(/\?v\d+/g, `?v${newVersion}`);

    fs.writeFileSync('index.html', html, 'utf8');
    console.log(`✔ Versión actualizada exitosamente: v${currentVersion} -> v${newVersion} (${newBadgeContent})`);
    
} catch (e) {
    console.error("Error actualizando la versión:", e);
}
