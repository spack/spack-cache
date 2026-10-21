let basePath = undefined;
let totalBuilds = undefined;
let packageData = undefined;
let packageCache = {};
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
const depTypes = ['build', 'link', 'run', 'test'];


// General
async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    return response.json();
}

async function loadPackage(name) {
    if (packageCache[name]) return packageCache[name];
    const data = await fetchJson(`${basePath}/api/packages/${encodeURIComponent(name)}.json`);
    // Expand the compact node table into the spec lookup used by the dependency tree dialog
    const nodes = data.nodes.map(([hash, depName, version]) => ({ hash, name: depName, version, dependencies: [] }));
    data.nodes.forEach(([, , , edges], i) => {
        for (let j = 0; j < edges.length; j += 2) {
            const dep = nodes[edges[j]];
            nodes[i].dependencies.push({
                name: dep.name,
                hash: dep.hash,
                parameters: { deptypes: depTypes.filter((_, bit) => edges[j + 1] & (1 << bit)) },
            });
        }
    });
    const specs = data.specs.map(({ node, ...spec }) => ({ ...spec, dependencies: nodes[node].dependencies }));
    packageCache[name] = {
        specs,
        specData: Object.fromEntries(nodes.map((n) => [n.hash, n])),
    };
    return packageCache[name];
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
            if (currentSpecs) {
                badgeFilters = Object.fromEntries(
                    Object.keys(badgeFilters).map((key) => [key, urlParams.getAll(key)])
                );
                badgeFiltersUpdated();
                updateTable();
            } else {
                // Set table empty message
                $('#cache').DataTable().clear().draw();
                $('.dt-empty').text('Loading data...');
                const name = packageName;
                loadPackage(name).then(() => {
                    // Skip if the user navigated elsewhere in the meantime
                    if (packageName === name) applyRoute(window.location.search);
                }).catch((err) => console.error(`Failed to load data for ${name}:`, err));
            }
        }
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

function setPackageName(name) {
    $('.package-name').text(name);
    $('.num-specs').text(packageData[name].count.toLocaleString());
    currentSpecs = packageCache[name]?.specs;
    specData = packageCache[name]?.specData;
    if (currentSpecs) updateBadgeOptions();
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
    if (!packageData) return;
    const releases = [...new Set(Object.values(packageData).map((p) => Object.keys(p.releases)).flat())];
    $('.total-builds-stat').text(totalBuilds.toLocaleString());
    $('.total-packages-stat').text(Object.keys(packageData).length.toLocaleString());
    $('.total-releases-stat').text(releases.length.toLocaleString());
    const orderedReleases = releases.filter((r) => r[0] === 'v').toSorted((a, b) => releaseNameToDate(a) - releaseNameToDate(b)).reverse();
    if (orderedReleases.length) {
        $('.recent-release-name').text(orderedReleases[0]);
    }
}

function setElementVisible(selector, visible) {
    $(selector).toggleClass('hidden', !visible);
}

function closeAllMenus() {
    setElementVisible('#columns-menu-wrapper', false);
    setElementVisible('#badge-options-menu', false);
    setElementVisible('#filters-menu', false);
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
    fetchJson(`${basePath}/api/index.json`).then((data) => {
        totalBuilds = data.builds;
        packageData = data.packages;
        populateSidebarTabs();
        applyRoute(window.location.search);
    }).catch((err) => console.error('Failed to load package index:', err));

    window.navigation.addEventListener('navigate', (e) => {
        const dest = e.destination.url;
        applyRoute(dest.includes('?') ? dest.split('?')[1] : '');
    });

    setupSidebarResize();
});
