const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const newSelect = `<select id="harm-mode" class="search-input" style="width:145px;">
                            <option value="ionian">Ionian (Major)</option>
                            <option value="dorian">Dorian</option>
                            <option value="phrygian">Phrygian</option>
                            <option value="lydian">Lydian</option>
                            <option value="mixolydian">Mixolydian</option>
                            <option value="aeolian">Aeolian (Minor)</option>
                            <option value="locrian">Locrian</option>
                        </select>`;

html = html.replace(/<select id="harm-mode" class="search-input" style="width:100px;">[\s\S]*?<\/select>/, newSelect);
fs.writeFileSync('index.html', html);
console.log('Fixed index.html select');
