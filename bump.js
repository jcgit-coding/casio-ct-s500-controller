const fs = require('fs');

try {
    let html = fs.readFileSync('index.html', 'utf8');

    // Extract current version number (e.g., v195)
    const versionMatch = html.match(/v(\d+)/);
    if (!versionMatch) {
        console.error("No se pudo encontrar la versión actual.");
        process.exit(1);
    }

    const oldVersion = parseInt(versionMatch[1]);
    const newVersion = oldVersion + 1;

    // Generate formatted date (e.g., "vie 09 oct 15:20 · COT")
    const date = new Date();
    const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    
    const dayStr = days[date.getDay()];
    const dateNum = String(date.getDate()).padStart(2, '0');
    const monthStr = months[date.getMonth()];
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    const newDateStr = `v${newVersion} &middot; ${dayStr} ${dateNum} ${monthStr} ${hours}:${minutes} &middot; COT`;

    // Replace the text inside the badge precisely
    html = html.replace(/(<span id="appVersionBadge"[^>]*>)(.*?)(<\/span>)/, `$1${newDateStr}$3`);

    // Replace cache busters in script and css tags (e.g., app.js?v195 -> app.js?v196)
    const oldVRegex = new RegExp(`\\?v${oldVersion}`, 'g');
    html = html.replace(oldVRegex, `?v${newVersion}`);

    fs.writeFileSync('index.html', html);
    console.log(`\u2714 Versión actualizada exitosamente: v${oldVersion} -> v${newVersion}`);
    
} catch (e) {
    console.error("Error actualizando la versión:", e);
}
