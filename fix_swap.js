document.addEventListener('DOMContentLoaded', () => {
    const swapBtns = document.querySelectorAll('.btn-swap');
    
    swapBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetPart = btn.getAttribute('data-target'); // e.g., 'U2'
            const currentPart = btn.closest('.track-card').getAttribute('data-part'); // e.g., 'U1'
            
            if (targetPart === currentPart) return;

            // The user wants to SWAP the instruments/searches between currentPart and targetPart
            
            const searchCurr = document.getElementById('search-' + currentPart);
            const listCurr = document.getElementById('list-' + currentPart);
            
            const searchTarg = document.getElementById('search-' + targetPart);
            const listTarg = document.getElementById('list-' + targetPart);

            if (!searchCurr || !searchTarg || !listCurr || !listTarg) return;

            // Save state
            const valCurr = searchCurr.value;
            const valTarg = searchTarg.value;
            
            const selCurr = listCurr.selectedIndex >= 0 ? listCurr.options[listCurr.selectedIndex].value : null;
            const selTarg = listTarg.selectedIndex >= 0 ? listTarg.options[listTarg.selectedIndex].value : null;

            // Swap searches
            searchCurr.value = valTarg;
            searchTarg.value = valCurr;
            
            searchCurr.dispatchEvent(new Event('input'));
            searchTarg.dispatchEvent(new Event('input'));

            // Reselect options
            if (selTarg) {
                Array.from(listCurr.options).forEach((opt, i) => { if (opt.value === selTarg) listCurr.selectedIndex = i; });
                listCurr.dispatchEvent(new Event('change'));
            }
            if (selCurr) {
                Array.from(listTarg.options).forEach((opt, i) => { if (opt.value === selCurr) listTarg.selectedIndex = i; });
                listTarg.dispatchEvent(new Event('change'));
            }
        });
    });
});
