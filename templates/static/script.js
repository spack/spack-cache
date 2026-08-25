let basePath = undefined;
let packageData = undefined;
let specData = undefined;
let uniqueAttrValues = undefined;
let uniqueAttrValuesPending = false;
let packageName = undefined;
let currentSpecs = undefined;
let sidebarMinWidth = 250;
let sidebarMaxWidth = 800;
let sidebarFilters = {}
let badgeOptions = {};
let badgeFilters = {
    hash: [],
    version: [],
    variant: [],
    platform: [],
    os: [],
    target: [],
    stack: [],
    release: [],
};
const pluralColumns = {
    variant: 'variants',
    release: 'releases',
    stack: 'stacks',
}
const shortHashLength = 7;
const maxBadges = 3;
let tableInitialized = false;
let expandedCells = [];
let showDevs = false;
let diffMode = false;
let common = {};
const noDiffMessage = '-';


// General
async function fetchGzippedJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    const ds = new DecompressionStream('gzip');
    const decompressedStream = response.body.pipeThrough(ds);
    const text = await new Response(decompressedStream).text();
    return JSON.parse(text);
}

function navigateToHome() {
    window.history.pushState(null, '', basePath + '/');
}

function applyRoute(params) {
    const urlParams = new URLSearchParams(params);
    packageName = urlParams.get('package');
    let contentToShow = 'home-content';
    setupHomepage();
    if (packageName) {
        contentToShow = 'package-not-found-content';
        if (packageData[packageName]) {
            contentToShow = 'package-content';
            setPackageName(packageName);
            if (!tableInitialized) {
                // https://datatables.net/manual/tech-notes/3
                setupDataTable();
            }
            if (specData) {
                badgeFilters = Object.fromEntries(
                    Object.keys(badgeFilters).map((key) => [key, urlParams.getAll(key)])
                );
                badgeFiltersUpdated();
                updateTable();
            } else {
                // Set table empty message
                $('.dt-empty').text('Loading data...');
            }
        }
    }
    if (packageData && specData && !uniqueAttrValues && !uniqueAttrValuesPending) {
        uniqueAttrValuesPending = true;
        const worker = new Worker(basePath + '/static/computeUnique.js');
        worker.postMessage([packageData, specData]);
        worker.onmessage = (e) => {
            uniqueAttrValues = Object.fromEntries(Object.entries(e.data).map(([key, value]) => {
                for (const col in pluralColumns) {
                    if (pluralColumns[col] === key) return [col, value];
                }
                return [key, value];
            }));
            populateFiltersMenu();
            updateBadgeOptions();
        };
        worker.onerror = (e) => {
            console.error('Failed to compute unique attribute values:', e.message);
            uniqueAttrValuesPending = false;
        };
    }
    applySidebarHighlights();
    showContent(contentToShow);
}

function syncRoute() {
    const urlParams = new URLSearchParams();
    urlParams.append('package', packageName);
    for (const key in badgeFilters) {
        for (const value of badgeFilters[key]) {
            urlParams.append(key, value);
        }
    }
    const newUrl = basePath + '?' + urlParams.toString();
    window.history.pushState(null, '', newUrl);
}

function showContent(content_id) {
    for (const id of ['loading-content', 'home-content', 'package-content', 'package-not-found-content']) {
        $('#' + id).css({ display: id === content_id ? 'block' : 'none' });
    }
}

function getAllSpecHashesForPackage(name) {
    return [...new Set(Object.values(packageData[name].specs).flat())]
}

function setPackageName(name) {
    $('.package-name').text(name);
    if (specData) {
        currentSpecs = getAllSpecHashesForPackage(name).map((hash) => specData[hash]);
        $('.num-specs').text(currentSpecs.length.toLocaleString());
        updateBadgeOptions();
    }
}

function copyCommand(e) {
    const target = $(e.currentTarget);
    const codeContent = $(target).parent().parent().find('code').text();
    const copyContent = codeContent.replace('$ ', '')
    navigator.clipboard.writeText(copyContent);
    target.children().eq(0).addClass('hidden');
    target.children().eq(1).removeClass('hidden');
    setTimeout(() => {
        target.children().eq(0).removeClass('hidden');
        target.children().eq(1).addClass('hidden');
    }, 3000);
}

function releaseNameToDate(releaseName) {
    if (releaseName[0] !== 'v') return undefined;
    const [year, month, day] = releaseName.slice(1).split('.')
    return new Date(year, month - 1, day)  // months are 0 indexed
}

function setupHomepage() {
    if (!specData || !packageData) return;
    const releases = [...new Set(Object.values(packageData).map((p) => p.releases).flat())];
    $('.total-builds-stat').text(Object.keys(specData).length.toLocaleString());
    $('.total-packages-stat').text(Object.keys(packageData).length.toLocaleString());
    $('.total-releases-stat').text(releases.length.toLocaleString());
    const orderedReleases = releases.filter((r) => r[0] === 'v').toSorted((a, b) => releaseNameToDate(a) - releaseNameToDate(b)).reverse();
    if (orderedReleases.length) {
        $('.recent-release-name').text(orderedReleases[0]);
    }
}

function closeAllMenus() {
    setColumnsMenuVisible(false);
    setBadgeOptionsMenuVisible(false);
    setFiltersMenuVisible(false);
}

function toggleChevron(container, open = undefined) {
    const currentChevron = $(container).find('svg.lucide-chevron');
    if (open === undefined) open = currentChevron.hasClass('lucide-chevron-right');
    if (open) {
        const downChevronIcon = $('.lucide-chevron-down').first().clone();
        currentChevron.replaceWith(downChevronIcon);
        return true;
    } else {
        const rightChevronIcon = $('.lucide-chevron-right').first().clone();
        currentChevron.replaceWith(rightChevronIcon);
        return false;
    }
}

function toggleCheckbox(container, checked = undefined) {
    const currentCheckbox = $(container).find('span.checkbox');
    if (checked === undefined) checked = currentCheckbox.hasClass('checkbox-unchecked');
    if (checked) {
        const checkedIcon = $('.checkbox-checked').first().clone();
        currentCheckbox.replaceWith(checkedIcon);
        return true;
    } else {
        const uncheckedIcon = $('.checkbox-unchecked').first().clone();
        currentCheckbox.replaceWith(uncheckedIcon);
        return false;
    }
}

function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

// Ready
$(document).ready(async function () {
    basePath = $('#base-path').text();
    fetchGzippedJson(`${basePath}/api/package_data.json.gz`).then((data) => {
        packageData = data;
        populateSidebarTabs();
        applyRoute(window.location.search);
    }).catch((err) => console.error('Failed to load package data:', err));
    fetchGzippedJson(`${basePath}/api/specs_data.json.gz`).then((data) => {
        specData = data;
        applyRoute(window.location.search);
    }).catch((err) => console.error('Failed to load spec data:', err));

    window.navigation.addEventListener('navigate', (e) => {
        const dest = e.destination.url;
        applyRoute(dest.includes('?') ? dest.split('?')[1] : '');
    });

    setupSidebarResize();
});
