let basePath = undefined;
let packageData = undefined;
let specData = undefined;
let packageName = undefined;
let currentSpecs = undefined;
let sidebarMinWidth = 250;
let sidebarMaxWidth = 800;
let badgeOptions = {};
let badgeFilters = {
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
const maxBadges = 3;
let tableInitialized = false;
let expandedCells = [];
let showDevs = false;
let diffMode = false;
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
    let contentToShow = 'home-content'
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
                )
                badgeFiltersUpdated();
                updateTable();
            } else {
                // Set table empty message
                Array.from(document.getElementsByClassName('dt-empty')).forEach(
                    (el) => el.innerHTML = 'Loading data...'
                )
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
            urlParams.append(key, value)
        }
    }
    const newUrl = basePath + '?' + urlParams.toString();
    window.history.pushState(null, '', newUrl);
}

function showContent(content_id) {
    for (const id of ['loading-content', 'home-content', 'package-content', 'package-not-found-content']) {
        document.getElementById(id).style.display = id === content_id ? 'block' : 'none'
    }
}

function setPackageName(name) {
    if (specData) {
        currentSpecs = packageData[packageName].specs.map((hash) => specData[hash]);
        updateBadgeOptions();
    }
    document.getElementById('package-name').innerHTML = name;
    document.getElementById('package-link').href = "https://packages.spack.io/package.html?name=" + name;
}

function matchString(match, string) {
    match = match.toLowerCase();
    string = string.toLowerCase();
    if (match.endsWith('$')) {
        return string.endsWith(match.slice(0, -1));
    } else {
        return string.includes(match);
    }
}

// Sidebar
function setupSidebarResize() {
    const resizer = document.getElementById('sidebar-resize');
    resizer.addEventListener('mousedown', (e) => {
        document.addEventListener('mousemove', resizeSidebar, false);
        document.addEventListener("mouseup", () => {
            document.removeEventListener("mousemove", resizeSidebar, false);
        }, false);
    })
}

function resizeSidebar(e) {
    let newWidth = e.clientX;
    newWidth = Math.max(sidebarMinWidth, newWidth);
    newWidth = Math.min(sidebarMaxWidth, newWidth);

    const sidebar = document.getElementById('sidebar');
    sidebar.style.width = `${newWidth}px`;

    const contentContainer = document.getElementById('content-container');
    contentContainer.style.marginLeft = `${newWidth + 25}px`;
    contentContainer.style.maxWidth = `calc(100% - ${newWidth + 50}px)`
}

function applySidebarHighlights() {
    Array.from(document.getElementsByClassName('sidebar-item')).forEach((item) => {
        if (item.package === packageName && (!item.release || badgeFilters.release.includes(item.release))) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    })
    Array.from(document.getElementsByClassName('caret')).forEach((group) => {
        if (badgeFilters.release.includes(group.release)) {
            group.classList.remove('collapsed');
        }
    })
}

function filterSidebar() {
    let resultsFound = false;
    const search = document.getElementById('sidebar-search');
    let filterString = search.value;
    const emphasisString = filterString.replace('$', '')
    Array.from(document.getElementsByClassName('sidebar-item')).forEach((item) => {
        const match = matchString(filterString, item.package);
        if (match) {
            resultsFound = true;
            item.classList.remove('hidden');
            item.innerHTML = emphasisString.length > 0 ? item.package.replace(emphasisString, `<span class='font-bold'>${emphasisString}</span>`): item.package;
        } else {
            item.classList.add('hidden');
            item.innerHTML = item.package;
        }
    })
    Array.from(document.getElementsByClassName('sidebar-group')).forEach((group) => {
        const [childCounter, childContainer] = group.children;
        const matchedChildren = Array.from(childContainer.children).filter((child) => matchString(filterString, child.package));
        childCounter.innerHTML = `(${matchedChildren.length})`;
        if (matchedChildren.length && (showDevs || !group.release.includes('develop'))) {
            group.classList.remove('hidden');
            if (emphasisString.length > 0) group.classList.remove('collapsed');
        } else {
            group.classList.add('hidden');
            group.classList.add('collapsed');
        }
    })
    document.getElementById('all-packages-nodata').style.display = resultsFound ? 'none' : 'block';
    document.getElementById('by-release-nodata').style.display = resultsFound ? 'none' : 'block';
}

function selectSidebarTab(tab) {
    ['sidebar-tabs', 'sidebar-tab-contents'].forEach((setName) => {
        const set = document.getElementById(setName);
        Array.from(set.children).forEach((t) => {
            if (t.id.includes(tab)) {
                t.classList.add('active')
            } else {
                t.classList.remove('active')
            }
        })
    });
}

function populateSidebarTabs() {
    if (!packageData) return;
    const allPackagesList = document.getElementById('all-packages-list');
    const byReleaseList = document.getElementById('by-release-list');
    const releases = {};
    Object.values(packageData).toSorted(
        (a, b) => a.uid.localeCompare(b.uid)
    ).forEach((pkg) => {
        allPackagesList.appendChild(createSidebarItem(pkg, undefined));
        pkg.releases.forEach((releaseName) => {
            if (!releases[releaseName]) {
                releases[releaseName] = createSidebarGroup(releaseName);
            }
            releases[releaseName].children[1].appendChild(createSidebarItem(pkg, releaseName))
        })
    })
    byReleaseList.replaceChildren(...Object.keys(releases).toSorted(
        (a, b) => a.localeCompare(b)
    ).map((key) => releases[key]));
    document.getElementById('all-packages-loading').style.display = 'none';
    document.getElementById('by-release-loading').style.display = 'none';
    filterSidebar();
}

function createSidebarItem(pkg, releaseName) {
    const item = document.createElement('li');
    item.classList.add('sidebar-item');
    item.innerHTML = pkg.uid;
    item.onclick = (e) => {
        e.stopPropagation();
        let newUrl = basePath + `?package=${pkg.uid}`;
        if (releaseName) newUrl += `&release=${releaseName}`;
        window.history.pushState(null, '', newUrl);
    }
    item.package = pkg.uid;
    if (releaseName) item.release = releaseName;
    return item;
}

function createSidebarGroup(groupName) {
    const group = document.createElement('li');
    group.classList.add('sidebar-group', 'caret', 'collapsed');
    group.innerHTML = groupName;
    const childCounter = document.createElement('span');
    childCounter.style.paddingLeft = '5px';
    group.appendChild(childCounter);
    const childrenContainer = document.createElement('ul');
    childrenContainer.classList.add('nested');
    group.appendChild(childrenContainer);
    group.onclick = () => {toggleSidebarGroup(group)};
    group.release = groupName;
    return group;
}

function setSidebarGroupOpen(group, open) {
    if (open) {
        group.classList.remove('collapsed')
    } else {
        group.classList.add('collapsed')
    }
}

function toggleSidebarGroup(group) {
    setSidebarGroupOpen(group, group.classList.contains('collapsed'))
}

function setAllSidebarGroupsOpen(open) {
    const groups = Array.from(document.getElementsByClassName('sidebar-group'));
    groups.forEach((group) => setSidebarGroupOpen(group, open));
}

function toggleShowDevs() {
    showDevs = !showDevs;
    filterSidebar();
}

// Specs Table
function toggleDiffMode() {
    diffMode = !diffMode;
    updateTable();
}

function createFilterBadge(key, value, remove) {
    const badge = document.createElement('div');
    badge.classList.add('release', 'searchable-badge');

    const keyLabel = document.createElement('label');
    keyLabel.classList.add('text-[10px]', 'label', 'floating');
    keyLabel.innerHTML = key;
    badge.appendChild(keyLabel);

    const valueLabel = document.createElement('label');
    valueLabel.innerHTML = value;
    badge.appendChild(valueLabel);

    if (remove) {
        const removeIcon = document.createElement('div');
        removeIcon.classList.add('remove-icon');
        removeIcon.innerHTML = 'X';
        badge.appendChild(removeIcon);
    }

    return badge;
}

function updateBadgeOptions() {
    badgeOptions = {};
    for (const column in badgeFilters) {
        badgeOptions[column] = [];
        const pluralColumn = pluralColumns[column] || column;
        for (const spec of currentSpecs) {
            const value = spec[pluralColumn];
            if (Array.isArray(value)) {
                for (const v of value) {
                    if (!badgeOptions[column].includes(v)) {
                        badgeOptions[column].push(v)
                    }
                }
            } else {
                if (!badgeOptions[column].includes(value)) {
                    badgeOptions[column].push(value)
                }
            }
        }
    }
    const container = document.getElementById('badge-options-list');
    container.innerHTML = '';
    for (const key in badgeOptions) {
        for (value of badgeOptions[key]) {
            const badge = createFilterBadge(key, value, false);
            badge.key = key;
            badge.value = value;
            badge.addEventListener('mousedown', (e) => {
                // prevent default on mousedown event so that focus remains on filter input
                e.preventDefault();
                addBadgeFilter(badge.key, badge.value)
            })
            container.appendChild(badge);
        }
    }
    filterBadgeOptions()
}

function addBadgeFilter(column, label) {
    if (!badgeFilters[column].includes(label)) {
        badgeFilters[column].push(label);
        syncRoute();
    }
}

function removeBadgeFilter(column, label) {
    badgeFilters[column] = badgeFilters[column].filter((l) => l !== label)
    syncRoute();
}

function badgeFiltersUpdated() {
    const container = document.getElementById('badge-filters');
    container.innerHTML = '';
    for (const key in badgeFilters) {
        for (const value of badgeFilters[key]) {
            const badge = createFilterBadge(key, value, true);
            badge.onclick = () => removeBadgeFilter(key, value);
            container.appendChild(badge);
        }
    }
}

function filterBadgeOptions() {
    const filterString = document.getElementById('badge-options-filter').value;
    const container = document.getElementById('badge-options-list');
    Array.from(container.children).forEach((badge) => {
        if (
            !filterString.length ||
            badge.key.toLowerCase().includes(filterString.toLowerCase()) ||
            badge.value.toLowerCase().includes(filterString.toLowerCase())
        ) {
            badge.classList.remove('hidden')
        } else {
            badge.classList.add('hidden')
        }
    })
}

function groupBadges(rowId, column, data, link = false) {
    const container = document.createElement('div');
    container.id = `row-${rowId}-${column}`;
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    const expand = expandedCells.includes(container.id);
    data.forEach((d, i) => {
        let badge = null
        if (d === noDiffMessage) {
            badge = document.createElement('div');
            badge.innerHTML = d;
        } else if (link) {
            badge = document.createElement('a')
            badge.style.textDecoration = 'underline';
            badge.classList.add('pl-2')
            badge.href = d.link;
            badge.innerHTML = d.label;
        } else {
            badge = document.createElement('button');
            badge.classList.add('release', 'searchable-badge');
            badge.onclick = () => addBadgeFilter(column, d);
            badge.innerHTML = d;
        }
        if (i >= maxBadges) {
            badge.classList.add('hidden')
            if (expand) {
                badge.style.display = 'inline-block';
            }
        }
        container.appendChild(badge)
    });
    if (data.length > maxBadges) {
        const showMore = document.createElement('button');
        showMore.classList.add('btn', 'btn-sm', 'btn-ghost', 'normal-case', 'pl-2')
        showMore.innerHTML = expand ? 'Show Less' : `... Show ${data.length - maxBadges} More`;
        showMore.onclick = (e) => showMoreBadges(e, data.length - maxBadges, container.id)
        container.appendChild(showMore)
    }
    return container;
}

function showMoreBadges(e, n, id) {
    const target = e.target
    $(target).parent().find('.hidden').toggle();
    $(target).text(function (i, text) {
        const showMoreText = `... Show ${n} More`;
        const expand = text === showMoreText;
        if (expand && !expandedCells.includes(id)) {
            expandedCells.push(id);
        } else if (!expand) {
            expandedCells = expandedCells.filter((cellId) => cellId !== id);
        }
        return expand ? "Show Less" : showMoreText;
    })
}

function displayHash(hash) {
    const container = document.createElement('div');
    container.onclick = (e) => e.stopPropagation();
    container.style.display = 'inline-flex';
    container.style.columnGap = '5px';
    const label = document.createElement('span');
    label.classList.add('font-mono', 'tooltip');
    label.style.fontSize = '0.9rem';
    label.innerHTML = hash.slice(0, 7);
    const tooltip = document.createElement('span');
    tooltip.classList.add('tooltip-text');
    tooltip.innerHTML = hash;
    label.appendChild(tooltip);
    container.appendChild(label);
    const copyButton = document.createElement('div');
    copyButton.classList.add('ri-file-copy-line');
    copyButton.onclick = () => {
        navigator.clipboard.writeText(hash);
        copyButton.classList.add('ri-check-line');
        copyButton.classList.remove('ri-file-copy-line');
        setTimeout(() => {
            copyButton.classList.remove('ri-check-line');
            copyButton.classList.add('ri-file-copy-line');
        }, 3000);

    };
    container.appendChild(copyButton);
    return container;
}

function setupColumnVisibilityOptions(columns) {
    const container = document.getElementById('columns-menu');
    const table = $('#cache').DataTable();
    for (const col in columns) {
        const visible = columns[col];
        const colIndex = table.columns().names().indexOf(col);
        table.column(colIndex).visible(visible);
        const item = document.createElement('li');
        if (visible) item.classList.add('checked');
        item.onclick = () => {
            const currentVisibility = table.column(colIndex).visible();
            if (currentVisibility) {
                table.column(colIndex).visible(false);
                item.classList.remove('checked');
            } else {
                table.column(colIndex).visible(true);
                item.classList.add('checked');
            }
        }
        item.innerHTML = col;
        container.appendChild(item);
    }
}

function setupDataTable() {
    $('#cache').DataTable({
        ordering: false,
        layout: {
            topStart: null,
            topEnd: null,
            bottom: 'paging',
            bottomStart: null,
            bottomEnd: null
        },
        language: {
            search: "Filter: ",
        },
        pageLength: 25,
        columns: [
            {
                name: 'hash',
                data: 'hash',
                className: 'nowrap',
                render: function (data, type, row, info) {
                    return displayHash(data);
                },
            },
            {
                name: 'version',
                data: 'version',
                className: 'dt-left',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'version', [data]);
                }
            },
            {
                name: 'releases',
                data: 'releases',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'release', data);
                },
            },
            {
                name: 'stacks',
                data: 'stacks',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'stack', data);
                },
            },
            {
                name: 'variants',
                data: 'variants',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'variant', data);
                },
            },
            {
                name: 'platform',
                data: 'platform',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'platform', [data]);
                },
            },
            {
                name: 'os',
                data: 'os',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'os', [data]);
                },
            },
            {
                name: 'target',
                data: 'target',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'target', [data]);
                },
            },
            {
                name: 'dependencies',
                data: 'dependencies',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'dependency', data, true);
                },
            },
        ],
        fixedHeader: true,
        responsive: {
            details: {
                renderer: function (api, rowIdx, columns) {
                    let container = document.createElement('div');
                    for (const column of columns) {
                        if (column.hidden) {
                            const row = document.createElement('div');
                            row.style.display = 'flex';

                            const keyLabel = document.createElement('div');
                            keyLabel.classList.add('table-responsive-column-label');
                            keyLabel.innerHTML = column.title;
                            row.appendChild(keyLabel);
                            row.appendChild(column.data);
                            container.appendChild(row);
                        }
                    }
                    return container;
                }
            }
        }
    });
    setupColumnVisibilityOptions({
        hash: true,
        version: true,
        releases: true,
        stacks: true,
        variants: false,
        platform: true,
        os: true,
        target: true,
        dependencies: false,
    })
    tableInitialized = true;
}

function updateTable() {
    let table = $('#cache').DataTable();
    let filteredData = currentSpecs.filter((d) => {
        for (const column in badgeFilters) {
            const labels = badgeFilters[column]
            for (let i = 0; i < labels.length; i++) {
                const value = labels[i];
                const pluralColumn = pluralColumns[column] || column
                if (d[pluralColumn] && !d[pluralColumn].includes(value)) {
                    return false;
                }
            }
        }
        return true;
    });
    if (diffMode && filteredData.length > 1) {
        const common = {};
        for (const key in filteredData[0]) {
            const value = filteredData[0][key];
            if (Array.isArray(value)) {
                common[key] = [];
                for (let v of value) {
                    if (v.label) v = v.label;
                    if (filteredData.every((d) => {
                        const dv = d[key].map((k) => k.label ? k.label : k)
                        return dv.includes(v)
                    })) {
                        common[key].push(v)
                    }
                }
            } else {
                common[key] = filteredData.every((d) => d[key] === value) ? value : null;
            }
        }
        filteredData = filteredData.map((d) => {
            return Object.fromEntries(
                Object.entries(d).map(([key, value]) => {
                    if (Array.isArray(value)) {
                        value = value.filter((v) => {
                            if (v.label) v = v.label;
                            return !common[key].includes(v)
                        });
                        if (!value.length) value = [noDiffMessage];
                    } else if (value === common[key]) {
                        value = noDiffMessage;
                    }
                    return [key, value]
                })
            )
        });
    }
    table.clear().rows.add(filteredData).draw();
    const resultSummary = document.getElementById('result-summary');
    resultSummary.innerHTML = `Showing ${filteredData.length} of ${currentSpecs.length} Results`;
}

// Ready
$(document).ready(async function () {
    basePath = document.getElementById('base-path').innerHTML;
    fetchGzippedJson(`${basePath}/api/package_data.json.gz`).then((data) => {
        packageData = data;
        populateSidebarTabs();
        applyRoute(window.location.search);
    }).catch((err) => console.error('Failed to load package data:', err));
    fetchGzippedJson(`${basePath}/api/specs_data.json.gz`).then((data) => {
        specData = data;
        applyRoute(window.location.search);
    }).catch((err) => console.error('Failed to load spec data:', err));

    window.navigation.addEventListener("navigate", (e) => {
        const dest = e.destination.url;
        applyRoute(dest.includes('?') ? dest.split('?')[1] : '')
    });

    setupSidebarResize();
})
