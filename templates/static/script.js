let basePath = undefined;
let packageData = undefined;
let specData = undefined;
let packageAttrValueSpecs = undefined;
let packageName = undefined;
let currentSpecs = undefined;
let sidebarMinWidth = 250;
let sidebarMaxWidth = 800;
let sidebarFilters = {}
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
    if (packageData && specData && !packageAttrValueSpecs) {
        computePackageAttrValueSpecs();
        populateFiltersMenu();
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
    setTextByClassName('package-name', name)
    if (specData) {
        currentSpecs = packageData[packageName].specs.map((hash) => specData[hash]);
        setTextByClassName('num-specs', currentSpecs.length.toLocaleString())
        updateBadgeOptions();
    }
}

function setTextByClassName(className, text) {
    Array.from(
        document.getElementsByClassName(className)
    ).forEach((el) => el.innerHTML = text);
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

function computePackageAttrValueSpecs() {
    packageAttrValueSpecs = {};
    for (const pName in packageData) {
        packageAttrValueSpecs[pName] = {};
        for (const specHash of packageData[pName].specs) {
            for (const key in specData[specHash]) {
                if (!packageAttrValueSpecs[pName][key]) packageAttrValueSpecs[pName][key] = {};
                let values = specData[specHash][key];
                if (Array.isArray(values)) {
                    values = values.map((v) => v.label ? v.label : v)
                } else {
                    values = [values]
                }
                for (val of values) {
                    if (!packageAttrValueSpecs[pName][key][val]) packageAttrValueSpecs[pName][key][val] = new Set();
                    packageAttrValueSpecs[pName][key][val].add(specHash);
                }
            }
        }
    }
}

function copyCommand(e) {
    const target = e.currentTarget;
    const codeContent = $(target).parent().parent().find('code').text();
    const copyContent = codeContent.replace('$ ', '')
    navigator.clipboard.writeText(copyContent);
    target.children[0].classList.add('hidden');
    target.children[1].classList.remove('hidden');
    setTimeout(() => {
        target.children[0].classList.remove('hidden');
        target.children[1].classList.add('hidden');
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
    setTextByClassName('total-builds-stat', Object.keys(specData).length.toLocaleString());
    setTextByClassName('total-packages-stat', Object.keys(packageData).length.toLocaleString());
    setTextByClassName('total-releases-stat', releases.length.toLocaleString());
    const orderedReleases = releases.filter((r) => r[0] === 'v').toSorted((a, b) => releaseNameToDate(a) - releaseNameToDate(b)).reverse();
    if (orderedReleases.length) {
        setTextByClassName('recent-release-name', orderedReleases[0]);
    }
}

function getUniqueAttributeValues(specs) {
    if (!specs) return;
    const uniqueValues = {};
    for (const column in badgeFilters) {
        uniqueValues[column] = [];
        const pluralColumn = pluralColumns[column] || column;
        for (const spec of specs) {
            const value = spec[pluralColumn];
            if (Array.isArray(value)) {
                for (const v of value) {
                    if (!uniqueValues[column].includes(v)) {
                        uniqueValues[column].push(v)
                    }
                }
            } else {
                if (!uniqueValues[column].includes(value)) {
                    uniqueValues[column].push(value)
                }
            }
        }
    }
    return uniqueValues;
}

function closeAllMenus() {
    setColumnsMenuVisible(false);
    setBadgeOptionsMenuVisible(false);
    setFiltersMenuVisible(false);
}

function toggleChevron(container, open = undefined) {
    const currentChevronQuery = $(container).find('svg.lucide-chevron');
    const currentChevron = currentChevronQuery.get(0);
    const parent = currentChevronQuery.parent().get(0);
    if (open === undefined) {
        open = currentChevron.classList.contains('lucide-chevron-right');
    }
    if (open) {
        const downChevronIcon = document.getElementsByClassName('lucide-chevron-down')[0].cloneNode(true);
        parent.replaceChild(downChevronIcon, currentChevron);
        return true;
    } else {
        const rightChevronIcon = document.getElementsByClassName('lucide-chevron-right')[0].cloneNode(true);
        parent.replaceChild(rightChevronIcon, currentChevron);
        return false;
    }
}

function toggleCheckbox(container, checked = undefined) {
    const currentCheckboxQuery = $(container).find('span.checkbox');
    const currentCheckbox = currentCheckboxQuery.get(0);
    const parent = currentCheckboxQuery.parent().get(0);
    if (checked === undefined) {
        checked = currentCheckbox.classList.contains('checkbox-unchecked');
    }
    if (checked) {
        const checkedIcon = document.getElementsByClassName('checkbox-checked')[0].cloneNode(true);
        parent.replaceChild(checkedIcon, currentCheckbox);
        return true;
    } else {
        const uncheckedIcon = document.getElementsByClassName('checkbox-unchecked')[0].cloneNode(true);
        parent.replaceChild(uncheckedIcon, currentCheckbox);
        return false;
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
    contentContainer.style.marginLeft = `${newWidth}px`;
    contentContainer.style.maxWidth = `calc(100% - ${newWidth}px)`
}

function setSidebarOpen(open) {
    if (open) {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('sidebar-shadow').classList.add('visible');
    } else {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-shadow').classList.remove('visible');
    }
}

function applySidebarHighlights() {
    Array.from(document.getElementsByClassName('sidebar-item')).forEach((item) => {
        if (item.package === packageName && (!item.release || badgeFilters.release.includes(item.release))) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    })
    if (badgeFilters.release.length) {
        selectSidebarTab('by-release');
        if (!showDevs && badgeFilters.release.some((r) => r.includes('develop'))) {
            toggleShowDevs();
            document.getElementById('show-devs-toggle').checked = showDevs;
        }
        setAllSidebarGroupsOpen(false);
        Array.from(document.getElementsByClassName('sidebar-group')).forEach((group) => {
            if (badgeFilters.release.includes(group.release)) {
                group.classList.remove('collapsed');
            }
        })
    }
}

function filterSidebar() {
    let resultsFound = false;
    const search = document.getElementById('sidebar-search');
    let filterString = search.value;
    const emphasisString = filterString.replace('$', '');
    Array.from(document.getElementsByClassName('sidebar-item')).forEach((item) => {
        let match = matchString(filterString, item.package);
        const [label, specCount] = item.children;
        const totalFilters = Object.values(sidebarFilters).reduce((sum, list) => sum + list.length, 0);
        if (totalFilters && packageAttrValueSpecs && packageAttrValueSpecs[item.package]) {
            const attrValueSpecs = packageAttrValueSpecs[item.package];
            let matchingSpecs = undefined;
            let matchComplete = true;
            for (const key in sidebarFilters) {
                const valueSpecs = attrValueSpecs[key] || attrValueSpecs[key + 's'];
                for (value of sidebarFilters[key]) {
                    matchComplete &&= !!valueSpecs[value];
                    if (valueSpecs[value]) {
                        if (!matchingSpecs) matchingSpecs = new Set(valueSpecs[value]);
                        else matchingSpecs = matchingSpecs.intersection(valueSpecs[value]);
                    }
                }
            }
            match &&= matchComplete && matchingSpecs && matchingSpecs.size > 0;
            specCount.innerHTML = matchComplete && matchingSpecs ? matchingSpecs.size : 0
        } else {
            specCount.innerHTML = packageData[item.package].specs.length;
        }
        if (match) {
            resultsFound = true;
            item.classList.remove('hidden');
            label.innerHTML = emphasisString.length > 0 ? item.package.replace(emphasisString, `<span class='font-bold text-foreground'>${emphasisString}</span>`) : item.package;
        } else {
            item.classList.add('hidden');
            label.innerHTML = item.package;
        }
    })
    Array.from(document.getElementsByClassName('sidebar-group')).forEach((group) => {
        const childContainer = $(group).find('ul').get(0);
        const childCounter = $(group).find('.child-counter').get(0);
        const matchedChildren = Array.from(childContainer.children).filter((child) => !child.classList.contains('hidden'));
        childCounter.innerHTML = matchedChildren.length.toLocaleString();
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
    document.getElementById('show-devs-toggle').checked = showDevs;
    filterSidebar();
}

function createSidebarItem(pkg, releaseName) {
    const item = document.createElement('li');
    item.classList.add(
        'sidebar-item', 'flex', 'w-full', 'items-center', 'justify-between', 'rounded',
        'px-2', 'py-1.5', 'text-left', 'text-xs', 'hover:bg-accent', 'hover:text-accent-foreground',
    );
    const nameLabel = document.createElement('code');
    nameLabel.innerHTML = pkg.uid;
    item.appendChild(nameLabel);
    const numSpecsLabel = document.createElement('span');
    numSpecsLabel.classList.add('text-muted-foreground');
    numSpecsLabel.innerHTML = pkg.specs.length;
    if (releaseName) numSpecsLabel.classList.add('hidden');
    item.appendChild(numSpecsLabel);
    item.onclick = (e) => {
        e.stopPropagation();
        closeAllMenus();
        const newUrl = new URL(basePath, window.location.origin);
        newUrl.searchParams.append('package', pkg.uid);
        if (releaseName) newUrl.searchParams.append('release', releaseName);
        for (const key in sidebarFilters) {
            for (const value of sidebarFilters[key]) {
                newUrl.searchParams.append(key, value);
            }
        }
        window.history.pushState(null, '', newUrl.toString());
    }
    item.package = pkg.uid;
    if (releaseName) item.release = releaseName;
    return item;
}

function createSidebarGroup(groupName) {
    // Clone svg nodes rather than creating them in JS
    const downChevronIcon = document.getElementsByClassName('lucide-chevron-down')[0].cloneNode(true);
    const tagIcon = document.getElementsByClassName('lucide-tag')[0].cloneNode(true);
    tagIcon.classList.remove('h-5', 'w-5');
    tagIcon.classList.add('h-3.5', 'w-3.5', 'text-primary');

    const group = document.createElement('li');
    group.classList.add('sidebar-group');
    const groupContainer = document.createElement('div');
    groupContainer.classList.add('flex', 'items-center');
    const groupButton = document.createElement('button');
    groupButton.classList.add(
        'flex', 'flex-1', 'items-center', 'gap-1', 'rounded', 'px-1.5', 'py-1.5',
        'text-left', 'hover:bg-accent', 'hover:text-accent-foreground',
    );
    groupButton.onclick = () => { toggleSidebarGroup(group) };
    groupButton.appendChild(downChevronIcon);
    groupButton.appendChild(tagIcon);
    const groupNameLabel = document.createElement('span');
    groupNameLabel.classList.add('truncate', 'font-medium', 'text-sm');
    groupNameLabel.innerHTML = groupName;
    groupButton.appendChild(groupNameLabel);
    const groupPackageCountLabel = document.createElement('span');
    groupPackageCountLabel.classList.add('ml-auto', 'text-xs', 'text-muted-foreground', 'child-counter');
    groupButton.appendChild(groupPackageCountLabel);
    groupContainer.appendChild(groupButton);
    group.appendChild(groupContainer);
    const childrenContainer = document.createElement('ul');
    childrenContainer.classList.add('nested', 'border-l', 'border-border', 'pl-1');
    group.appendChild(childrenContainer);
    group.release = groupName;
    return group;
}

function setSidebarGroupOpen(group, open) {
    open = toggleChevron(group, open);
    if (open) {
        group.classList.remove('collapsed');
    } else {
        group.classList.add('collapsed');
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

function setFiltersMenuVisible(visible) {
    const menu = document.getElementById('filters-menu');
    if (visible) {
        menu.classList.remove('hidden');
    } else {
        menu.classList.add('hidden');
    }
}

function setFiltersMenuGroupOpen(group, open = undefined) {
    open = toggleChevron(group, open);
    const items = $(group).find('.group-items').get(0);
    if (open) {
        Array.from(document.getElementsByClassName('filter-group')).filter(
            (g) => g.key !== group.key
        ).forEach((g) => setFiltersMenuGroupOpen(g, false));
        items.classList.remove('hidden');
    } else {
        items.classList.add('hidden');
    }
}

function searchFilterGroup(e, groupList) {
    for (const child of groupList.children) {
        if (child.searchContent.toLowerCase().includes(e.target.value.toLowerCase())) {
            child.classList.remove('hidden');
        } else {
            child.classList.add('hidden');
        }
    }
}

function toggleSidebarFilter(key, value, button) {
    const checked = toggleCheckbox(button);
    const filtersList = document.getElementById('filters-list');
    const filterId = `${key}-${value}`.replaceAll('.', '-').replaceAll('+', '-').replaceAll('~', '-').replaceAll('_', '-');
    if (!sidebarFilters[key]) sidebarFilters[key] = [];
    if (checked) {
        button.classList.add('checked');
        sidebarFilters[key].push(value);
        const filterChip = document.createElement('span');
        filterChip.id = filterId;
        filterChip.classList.add('inline-flex', 'max-w-full', 'items-center', 'gap-1', 'rounded', 'border', 'border-primary/30', 'bg-primary/10', 'px-1.5', 'py-0.5', 'text-[10px]', 'text-foreground');
        const filterChipKey = document.createElement('span');
        filterChipKey.classList.add('uppercase', 'tracking-wider', 'text-muted-foreground');
        filterChipKey.innerHTML = key;
        filterChip.appendChild(filterChipKey);
        const filterChipValue = document.createElement('span');
        filterChipValue.classList.add('truncate', 'font-mono');
        filterChipValue.innerHTML = value;
        filterChip.appendChild(filterChipValue);
        const filterChipCloseButton = document.createElement('button');
        filterChipCloseButton.classList.add('ml-0.5', 'rounded');
        filterChipCloseButton.innerHTML = 'X';
        filterChip.appendChild(filterChipCloseButton);
        filterChip.onclick = () => {
            toggleSidebarFilter(key, value, button)
        };
        filterChip.title = 'Remove filter';
        filtersList.appendChild(filterChip);
    } else {
        button.classList.remove('checked');
        sidebarFilters[key] = sidebarFilters[key].filter((v) => v !== value);
        const filterChip = $(filtersList).find(`#${filterId}`).get(0);
        filtersList.removeChild(filterChip);
    }
    sidebarFiltersUpdated();
}

function clearAllSidebarFilters() {
    sidebarFilters = {};
    const menuContent = document.getElementById('filters-menu-content');
    $(menuContent).find('button.checked').each((index, button) => { 
        button.classList.remove('checked');
        toggleCheckbox(button);
    });
    const filtersList = document.getElementById('filters-list');
    filtersList.replaceChildren(filtersList.children[0]);
    sidebarFiltersUpdated();
}

function sidebarFiltersUpdated() {
    const totalFilters = Object.values(sidebarFilters).reduce((sum, list) => sum + list.length, 0);
    const menuButton = document.getElementById('filters-menu-button');
    const filtersList = document.getElementById('filters-list');
    const filtersCount = document.getElementById('filters-count');
    filtersCount.innerHTML = totalFilters;
    if (totalFilters > 0) {
        menuButton.classList.remove('border-input', 'bg-background', 'text-muted-foreground');
        menuButton.classList.add('border-primary/50', 'bg-primary/5', 'text-foreground');
        filtersList.classList.remove('hidden');
        filtersCount.classList.remove('hidden');
    } else {
        menuButton.classList.add('border-input', 'bg-background', 'text-muted-foreground');
        menuButton.classList.remove('border-primary/50', 'bg-primary/5', 'text-foreground');
        filtersList.classList.add('hidden');
        filtersCount.classList.add('hidden');
    }
    filterSidebar();
}

function populateFiltersMenu() {
    const uniqueValues = getUniqueAttributeValues(Object.values(specData));
    const content = document.getElementById('filters-menu-content');
    content.innerHTML = '';
    for (const key in uniqueValues) {
        // Exclude release from filters menu; "by release" tab should be used instead
        if (key !== 'release') {
            const keyGroup = document.createElement('div');
            keyGroup.classList.add('rounded', 'filter-group');
            keyGroup.key = key;
            const keyButton = document.createElement('button');
            keyButton.classList.add('flex', 'w-full', 'items-center', 'gap-1.5', 'rounded', 'px-2', 'py-1.5', 'text-left', 'text-sm', 'hover:bg-accent');
            const rightChevronIcon = document.getElementsByClassName('lucide-chevron-right')[0].cloneNode(true);
            keyButton.appendChild(rightChevronIcon);
            const keyLabel = document.createElement('span');
            keyLabel.classList.add('flex-1');
            keyLabel.innerHTML = key[0].toLocaleUpperCase() + key.slice(1);
            keyButton.appendChild(keyLabel);
            const countLabel = document.createElement('span');
            countLabel.classList.add('text-[10px]', 'text-muted-foreground', 'tabular-nums');
            countLabel.innerHTML = uniqueValues[key].length;
            keyButton.appendChild(countLabel);
            keyGroup.appendChild(keyButton);
            keyButton.onclick = () => setFiltersMenuGroupOpen(keyGroup);
            const groupItems = document.createElement('div');
            groupItems.classList.add('hidden', 'group-items', 'mb-1', 'border-l', 'border-border', 'pl-1');
            groupItems.style.marginLeft = '14px';
            const groupItemsList = document.createElement('ul');
            groupItemsList.classList.add('overflow-y-auto');
            groupItemsList.style.maxHeight = '250px';
            if (uniqueValues[key].length > 10) {
                // Only add a search box if more than 10 values exist
                const searchContainer = document.createElement('div');
                searchContainer.classList.add('relative', 'my-1', 'mr-1');
                const searchIcon = document.getElementsByClassName('lucide-search-mini')[0].cloneNode(true);
                searchContainer.appendChild(searchIcon);
                const searchInput = document.createElement('input');
                searchInput.type = 'search';
                searchInput.placeholder = 'Search ' + key;
                searchInput.classList.add('w-full', 'rounded', 'border', 'border-input', 'bg-background', 'py-1', 'text-xs', 'outline-none', 'focus:ring-1', 'focus:ring-ring');
                searchInput.style.paddingLeft = '24px';
                searchInput.oninput = (e) => searchFilterGroup(e, groupItemsList);
                searchContainer.appendChild(searchInput);
                groupItems.appendChild(searchContainer);
            }
            for (const value of uniqueValues[key].toSorted()) {
                const item = document.createElement('li');
                const itemButton = document.createElement('button');
                itemButton.classList.add('flex', 'w-full', 'items-center', 'gap-2', 'rounded', 'px-1.5', 'py-1', 'text-left', 'text-xs', 'hover:bg-accent');
                itemButton.onclick = () => toggleSidebarFilter(key, value, itemButton);
                const itemCheckbox = document.getElementsByClassName('checkbox-unchecked')[0].cloneNode(true);
                itemButton.appendChild(itemCheckbox);
                const itemLabel = document.createElement('span');
                itemLabel.classList.add('truncate', 'font-mono');
                itemLabel.innerHTML = value;
                itemButton.appendChild(itemLabel);
                item.appendChild(itemButton);
                item.searchContent = value;
                groupItemsList.appendChild(item);
            }
            groupItems.appendChild(groupItemsList);
            keyGroup.appendChild(groupItems)
            content.appendChild(keyGroup);
        }
    }
}

// Install Dialog
function toggleInstallDialogShown(hash) {
    const dialog = document.getElementById('install-dialog');
    if (dialog.classList.contains('hidden')) {
        dialog.classList.remove('hidden');
        const command = document.getElementById('install-command');
        const packageInstallDetail = document.getElementById('package-install-detail');
        const hashInstallDetail = document.getElementById('hash-install-detail');
        if (hash) {
            command.innerHTML = 'spack install /' + hash;
            packageInstallDetail.classList.add('hidden');
            hashInstallDetail.classList.remove('hidden');
        } else {
            command.innerHTML = 'spack install ' + packageName;
            packageInstallDetail.classList.remove('hidden');
            hashInstallDetail.classList.add('hidden');
        }
    } else {
        dialog.classList.add('hidden');
    }
}

function toggleInstallDialogExpandedSection() {
    const expansionButton = document.getElementById('install-dialog-expansion-button');
    const expansionContent = document.getElementById('install-dialog-expansion-content');
    const open = toggleChevron(expansionButton);
    if (open) {
        expansionContent.classList.remove('hidden');
    } else {
        expansionContent.classList.add('hidden');
    }
}

// Specs Table
function toggleDiffMode() {
    diffMode = !diffMode;
    const button = document.getElementById('diff-mode-button');
    if (diffMode) {
        button.classList.add('border-primary/40', 'bg-primary/10', 'text-primary')
        button.children[1].innerHTML = 'Show all values';
        const eyeOffIcon = document.getElementsByClassName('lucide-eye-off')[0].cloneNode(true);
        button.replaceChild(eyeOffIcon, button.children[0]);
    } else {
        button.classList.remove('border-primary/40', 'bg-primary/10', 'text-primary')
        button.children[1].innerHTML = 'Hide common values';
        const eyeOnIcon = document.getElementsByClassName('lucide-eye-on')[0].cloneNode(true);
        button.replaceChild(eyeOnIcon, button.children[0]);
    }
    updateTable();
}

function createFilterBadge(key, value, remove) {
    const badge = document.createElement('div');
    badge.classList.add(
        'group', 'inline-flex', 'items-center', 'gap-1', 'rounded-md',
        'border', 'border-primary/40', 'bg-primary/10', 'px-2', 'py-0.5',
        'text-xs', 'text-primary', 'hover:bg-primary/20'
    );

    const keyLabel = document.createElement('label');
    keyLabel.classList.add('text-primary/70');
    keyLabel.style.textTransform = 'capitalize';
    keyLabel.innerHTML = key + ': ';
    badge.appendChild(keyLabel);

    const valueLabel = document.createElement('label');
    valueLabel.innerHTML = value;
    badge.appendChild(valueLabel);

    if (remove) {
        const removeIcon = document.getElementsByClassName('lucide-close')[0].cloneNode(true);
        removeIcon.classList.remove('h-4', 'w-4');
        removeIcon.classList.add('h-3', 'w-3');
        badge.appendChild(removeIcon);
    }

    return badge;
}

function updateBadgeOptions() {
    badgeOptions = getUniqueAttributeValues(currentSpecs);
    const container = document.getElementById('badge-options-list');
    container.innerHTML = '';
    for (const key in badgeOptions) {
        const keyLabel = document.createElement('div');
        keyLabel.classList.add(
            'sticky', 'top-0', 'bg-surface-elevated', 'px-3', 'py-1', 'text-[10px]',
            'font-semibold', 'uppercase', 'tracking-wider', 'text-muted-foreground',
        )
        keyLabel.innerHTML = key;
        keyLabel.searchContent = badgeOptions[key].join(',');
        container.appendChild(keyLabel);
        for (value of badgeOptions[key]) {
            const valueLabel = document.createElement('button');
            valueLabel.classList.add(
                'flex', 'w-full', 'items-baseline', 'gap-2', 'px-3', 'py-1.5',
                'text-left', 'text-xs', 'hover:bg-accent', 'hover:text-accent-foreground'
            )
            valueLabel.innerHTML = value;
            valueLabel.searchContent = value;
            // Copy key and value for onclick definition;
            const [k, v] = [key, value];
            valueLabel.onclick = () => { addBadgeFilter(k, v) };
            container.appendChild(valueLabel);
        }
    }
    filterBadgeOptions()
}

function setBadgeOptionsMenuVisible(visible) {
    const menu = document.getElementById('badge-options-menu');
    if (visible) {
        menu.classList.remove('hidden');
    } else {
        menu.classList.add('hidden');
    }
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
    Array.from(container.children).forEach((child) => {
        if (!filterString.length || child.searchContent.toLowerCase().includes(filterString.toLowerCase())) {
            child.classList.remove('hidden')
        } else {
            child.classList.add('hidden')
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
            if (badgeFilters[column].includes(d)) {
                badge.classList.add(
                    'group', 'inline-flex', 'items-center', 'gap-1', 'rounded-md',
                    'border', 'border-primary/40', 'bg-primary/10', 'px-2', 'py-0.5',
                    'text-xs', 'text-primary', 'hover:bg-primary/20'
                );
            } else {
                badge.classList.add(
                    'inline-flex', 'max-w-full', 'items-center', 'rounded', 'text-left', 'text-xs',
                    'transition-colors', 'border', 'border-transparent', 'px-1.5', 'py-0.5',
                    'underline', 'decoration-dashed', 'decoration-primary/40', 'underline-offset-[3px]',
                    'hover:border-pill-border', 'hover:bg-pill-bg', 'hover:text-foreground', 'hover:no-underline',
                );
            }
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
        showMore.classList.add('toggle', 'text-xs', 'pl-2')
        showMore.innerHTML = expand ? 'Show Less' : `... Show ${data.length - maxBadges} More`;
        showMore.onclick = (e) => showMoreBadges(e, data.length - maxBadges, container.id)
        container.appendChild(showMore)
    }
    return container;
}

function showMoreBadges(e, n, id) {
    const target = e.target;
    const visible = target.innerHTML === 'Show Less';
    const container = $(target).parent().get(0);
    target.innerHTML = visible ? `... Show ${n} More` : 'Show Less';
    for (const child of Array.from(container.children).slice(maxBadges)) {
        if (!child.classList.contains('toggle')) {
            if (visible) {
                child.classList.add('hidden')
            } else {
                child.classList.remove('hidden');
            }
        }
    }
}

function displayHash(hash) {
    const container = document.createElement('div');
    container.style.display = 'contents';
    const installButton = document.createElement('button');
    installButton.classList.add(
        'inline-flex', 'items-center', 'gap-1', 'rounded-md', 'border', 'border-border',
        'px-2', 'py-1', 'text-xs', 'text-muted-foreground', 'transition-colors', 'hover:text-foreground',
    )
    installButton.style.marginRight = '22px';
    const installIcon = document.getElementsByClassName('lucide-download')[0].cloneNode(true);
    installButton.appendChild(installIcon);
    const installLabel = document.createElement('span');
    installLabel.innerHTML = 'Install';
    installButton.appendChild(installLabel);
    installButton.onclick = () => toggleInstallDialogShown(hash);
    container.appendChild(installButton);
    const hashButton = document.createElement('button');
    hashButton.classList.add('inline-flex', 'items-center', 'gap-1.5', 'font-mono', 'text-xs', 'hover:text-primary')
    hashButton.title = hash.toLowerCase();
    const hashLabel = document.createElement('span');
    hashLabel.classList.add('truncate');
    hashLabel.innerHTML = hash.slice(0, 7);
    hashButton.appendChild(hashLabel);
    const copyIcon = document.getElementsByClassName('lucide-copy')[0].cloneNode(true);
    const checkIcon = document.getElementsByClassName('lucide-check')[0].cloneNode(true);
    hashButton.appendChild(copyIcon);
    hashButton.onclick = () => {
        navigator.clipboard.writeText(hash);
        hashButton.replaceChild(checkIcon, copyIcon);
        setTimeout(() => {
            hashButton.replaceChild(copyIcon, checkIcon);
        }, 3000)

    }
    container.appendChild(hashButton);
    return container;
}

function setupColumnVisibilityOptions(columns) {
    const container = document.getElementById('columns-menu');
    const table = $('#cache').DataTable();
    for (const col in columns) {
        const visible = columns[col];
        const colIndex = table.columns().names().indexOf(col);
        table.column(colIndex).visible(visible);
        const item = document.createElement('label');
        item.classList.add(
            'flex', 'cursor-pointer', 'items-center', 'gap-2', 'px-3', 'py-1.5', 'text-xs', 'hover:bg-accent'
        )
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('h-3.5', 'w-3.5', 'accent-primary');
        checkbox.checked = visible;
        checkbox.oninput = () => {
            const currentVisibility = table.column(colIndex).visible();
            if (currentVisibility) {
                table.column(colIndex).visible(false);
                item.classList.remove('checked');
            } else {
                table.column(colIndex).visible(true);
                item.classList.add('checked');
            }
            updateCommonValues(undefined);
        }
        item.appendChild(checkbox);
        const itemLabel = document.createElement('span');
        itemLabel.innerHTML = col;
        item.appendChild(itemLabel);
        container.appendChild(item);
    }
}

function setColumnsMenuVisible(visible) {
    const columnsMenuWrapper = document.getElementById('columns-menu-wrapper');
    if (visible) {
        columnsMenuWrapper.classList.remove('hidden');
    } else {
        columnsMenuWrapper.classList.add('hidden');
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
        columnDefs: [
            { targets: 0, width: '200px' },
        ],
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

function updateCommonValues(filteredData) {
    badgeFiltersUpdated();
    const table = $('#cache').DataTable();
    if (!filteredData) filteredData = table.rows().data().toArray();
    common = {};
    for (const key in filteredData[0]) {
        const value = filteredData[0][key];
        common[key] = [];
        if (Array.isArray(value)) {
            for (let v of value) {
                if (v.label) v = v.label;
                if (filteredData.every((d) => {
                    const dv = d[key].map((k) => k.label ? k.label : k)
                    return dv.includes(v)
                })) {
                    common[key].push(v)
                }
            }
        } else if (filteredData.every((d) => d[key] === value)) {
            common[key].push(value);
        }
    }
    const badgeFiltersContainer = document.getElementById('badge-filters');
    for (var key in common) {
        let keyName = key;
        if (keyName !== 'os' && keyName.endsWith('s')) keyName = keyName.slice(0, -1);
        const colIndex = table.columns().names().indexOf(key);
        if (table.column(colIndex).visible()) {
            for (const value of common[key]) {
                if (badgeFilters[keyName] && !badgeFilters[keyName].includes(value)) {
                    const container = document.createElement('span');
                    container.classList.add(
                        'inline-flex', 'items-center', 'gap-1', 'rounded-md', 'bg-muted', 'px-2', 'py-0.5', 'text-xs'
                    )
                    const keyLabel = document.createElement('span');
                    keyLabel.classList.add('text-muted-foreground');
                    keyLabel.innerHTML = keyName + ': ';
                    container.appendChild(keyLabel);
                    const valueLabel = document.createElement('span');
                    valueLabel.innerHTML = value;
                    container.appendChild(valueLabel);
                    badgeFiltersContainer.appendChild(container);
                }
            }
        }
    }
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
    updateCommonValues(filteredData);
    if (diffMode && filteredData.length > 1) {
        filteredData = filteredData.map((d) => Object.fromEntries(
            Object.entries(d).map(([key, value]) => {
                if (Array.isArray(value)) {
                    value = value.filter((v) => {
                        if (v.label) v = v.label;
                        return !common[key].includes(v)
                    });
                    if (!value.length) value = [noDiffMessage];
                } else if (common[key].includes(value)) {
                    value = noDiffMessage;
                }
                return [key, value]
            })
        ));
    }
    table.clear().rows.add(filteredData).draw();
    setTextByClassName('num-table-rows', filteredData.length.toLocaleString());
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
