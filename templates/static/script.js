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
    if (specData) {
        const allSpecHashes = Object.values(packageData[name].specs).flat();
        currentSpecs = allSpecHashes.map((hash) => specData[hash]);
        $('.num-specs').text(currentSpecs.length.toLocaleString());
        updateBadgeOptions();
    }
}

function computePackageAttrValueSpecs() {
    packageAttrValueSpecs = {};
    for (const pName in packageData) {
        packageAttrValueSpecs[pName] = {};
        const allSpecHashes = Object.values(packageData[pName].specs).flat();
        for (const specHash of allSpecHashes) {
            for (const key in specData[specHash]) {
                if (!packageAttrValueSpecs[pName][key]) packageAttrValueSpecs[pName][key] = {};
                let values = specData[specHash][key];
                if (Array.isArray(values)) {
                    values = values.map((v) => v.label ? v.label : v);
                } else {
                    values = [values];
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

function getUniqueAttributeValues(specs) {
    if (!specs) return;
    const uniqueValues = {};
    for (const column in badgeFilters) {
        if (column !== 'hash') {
            uniqueValues[column] = [];
            const pluralColumn = pluralColumns[column] || column;
            for (const spec of specs) {
                const value = spec[pluralColumn];
                if (Array.isArray(value)) {
                    for (const v of value) {
                        if (!uniqueValues[column].includes(v)) {
                            uniqueValues[column].push(v);
                        }
                    }
                } else {
                    if (!uniqueValues[column].includes(value)) {
                        uniqueValues[column].push(value);
                    }
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

// Sidebar
function setupSidebarResize() {
    const resizer = $('#sidebar-resize');
    resizer.on('mousedown', (e) => {
        $(document).on('mousemove.sidebarResize', resizeSidebar);
        $(document).one('mouseup.sidebarResize', () => {
            $(document).off('mousemove.sidebarResize', resizeSidebar);
        });
    });
}

function resizeSidebar(e) {
    let newWidth = e.clientX;
    newWidth = Math.max(sidebarMinWidth, newWidth);
    newWidth = Math.min(sidebarMaxWidth, newWidth);
    $('#sidebar').css('width', `${newWidth}px`);
    $('#content-container').css({
        marginLeft: `${newWidth}px`,
        maxWidth: `calc(100% - ${newWidth}px)`,
    });
}

function setSidebarOpen(open) {
    $('#sidebar').toggleClass('open', open);
    $('#sidebar-shadow').toggleClass('visible', open);
}

function applySidebarHighlights() {
    $('.sidebar-item').each((_, item) => {
        const itemPackage = $(item).attr('package');
        const itemRelease = $(item).attr('release');
        const isActive = itemPackage === packageName && (!itemRelease || badgeFilters.release.includes(itemRelease));
        $(item).toggleClass('active', isActive);
    });
    if (badgeFilters.release.length) {
        selectSidebarTab('by-release');
        if (!showDevs && badgeFilters.release.some((r) => r.includes('develop'))) {
            toggleShowDevs();
            $('#show-devs-toggle').prop('checked', showDevs);
        }
        setAllSidebarGroupsOpen(false);
        $('.sidebar-group').each((_, item) => {
            const itemRelease = $(item).attr('release');
            if (badgeFilters.release.includes(itemRelease)) {
                $(item).removeClass('collapsed');
            }
        });
    }
}

function filterSidebar() {
    let resultsFound = false;
    const filterString = ($('#sidebar-search').val() || '').toLowerCase();
    const emphasisString = filterString.replace('$', '');
    $('.sidebar-item').each((_, item) => {
        const itemPackage = $(item).attr('package').toLowerCase();
        const itemRelease = $(item).attr('release');
        let match = filterString.endsWith('$') ? itemPackage.endsWith(filterString.slice(0, -1)) : itemPackage.includes(filterString);
        const [label, specCount] = item.children;
        const totalFilters = Object.values(sidebarFilters).reduce((sum, list) => sum + list.length, 0);
        if (totalFilters && packageAttrValueSpecs && packageAttrValueSpecs[itemPackage]) {
            const attrValueSpecs = packageAttrValueSpecs[itemPackage];
            let matchingSpecs = undefined;
            let matchComplete = true;
            for (const key in sidebarFilters) {
                const valueSpecs = attrValueSpecs[key] || attrValueSpecs[key + 's'];
                for (const value of sidebarFilters[key]) {
                    matchComplete &&= !!valueSpecs?.[value];
                    if (valueSpecs?.[value]) {
                        if (!matchingSpecs) matchingSpecs = new Set(valueSpecs[value]);
                        else matchingSpecs = matchingSpecs.intersection(valueSpecs[value]);
                    }
                }
            }
            match &&= matchComplete && matchingSpecs && matchingSpecs.size > 0;
            specCount.innerHTML = matchComplete && matchingSpecs ? matchingSpecs.size : 0;
        } else {
            if (itemRelease) {
                specCount.innerHTML = packageData[itemPackage].specs[itemRelease].length;
            } else {
                const allSpecHashes = Object.values(packageData[itemPackage].specs).flat();
                specCount.innerHTML = allSpecHashes.length;
            }
        }
        if (match) {
            resultsFound = true;
            $(item).removeClass('hidden');
            label.innerHTML = emphasisString.length > 0 ? itemPackage.replace(emphasisString, `<span class='font-bold text-foreground'>${emphasisString}</span>`) : itemPackage;
        } else {
            $(item).addClass('hidden');
            label.innerHTML = itemPackage;
        }
    });
    $('.sidebar-group').each((_, group) => {
        const specCounts = $(group).find('ul').children().not('.hidden').find('.spec-counter').map(
            (_, item) => parseInt($(item).text())
        ).get();
        const specSum = specCounts.reduce((acc, curr) => acc + curr, 0);
        const groupRelease = $(group).attr('release');
        $(group).find('.child-counter').text(specSum);
        if (specCounts.length && (showDevs || !groupRelease.includes('develop'))) {
            $(group).removeClass('hidden');
            if (emphasisString.length > 0) $(group).removeClass('collapsed');
        } else {
            $(group).addClass('hidden collapsed');
        }
    });
    $('#all-packages-nodata').css('display', resultsFound ? 'none' : 'block');
    $('#by-release-nodata').css('display', resultsFound ? 'none' : 'block');
}

function selectSidebarTab(tab) {
    ['#sidebar-tabs', '#sidebar-tab-contents'].forEach((setName) => {
        $(setName).children().each((_, item) => {
            $(item).toggleClass('active', item.id.includes(tab));
        });
    });
}

function populateSidebarTabs() {
    if (!packageData) return;
    const allPackagesList = $('#all-packages-list');
    const byReleaseList = $('#by-release-list');
    const releases = {};
    Object.values(packageData).toSorted(
        (a, b) => a.uid.localeCompare(b.uid)
    ).forEach((pkg) => {
        allPackagesList.append(createSidebarItem(pkg, undefined));
        pkg.releases.forEach((releaseName) => {
            if (!releases[releaseName]) {
                releases[releaseName] = createSidebarGroup(releaseName);
            }
            releases[releaseName].children().eq(1).append(createSidebarItem(pkg, releaseName));
        });
    });
    byReleaseList.empty().append(...Object.keys(releases).toSorted(
        (a, b) => a.localeCompare(b)
    ).map((key) => releases[key]));
    $('#all-packages-loading, #by-release-loading').hide();
    $('#show-devs-toggle').prop('checked', showDevs);
    filterSidebar();
}

function createSidebarItem(pkg, releaseName) {
    return $('<li>', {
        'class': 'sidebar-item flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground',
        click: (e) => {
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
    }).attr({
        package: pkg.uid,
        release: releaseName,
    }).append($('<code>', {text: pkg.uid})).append(
        $('<span>', {
            'class': 'text-muted-foreground spec-counter', 
            text: releaseName ? pkg.specs[releaseName].length : Object.values(pkg.specs).flat().length,
        })
    );
}

function createSidebarGroup(groupName) {
    // Clone svg nodes rather than creating them in JS
    const downChevronIcon = $('.lucide-chevron-down').first().clone();
    const tagIcon = $('.lucide-tag').first().clone();
    $(tagIcon).removeClass('h-5 w-5').addClass('h-3.5 w-3.5 text-primary');
    
    const group = $('<li>', {'class': 'sidebar-group'}).attr({
        release: groupName
    })
    const groupTitle = $('<div>', {'class': 'flex items-center'}).append(
        $('<button>', {
            'class': 'flex flex-1 items-center gap-1 rounded px-1.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground',
            click: () => { toggleSidebarGroup(group) },
        }).append(downChevronIcon).append(tagIcon).append(
            $('<span>', {'class': 'truncate font-medium text-sm', text: groupName})
        ).append(
            $('<span>', {'class': 'ml-auto text-xs text-muted-foreground child-counter'})
        )
    )
    group.append(groupTitle).append(
        $('<ul>', {'class': 'nested border-l border-border pl-1'})
    );
    return group;
}

function setSidebarGroupOpen(group, open) {
    open = toggleChevron(group, open);
    $(group).toggleClass('collapsed', !open);
}

function toggleSidebarGroup(group) {
    setSidebarGroupOpen(group, $(group).hasClass('collapsed'));
}

function setAllSidebarGroupsOpen(open) {
    $('.sidebar-group').each((_, group) => setSidebarGroupOpen(group, open));
}

function toggleShowDevs() {
    showDevs = !showDevs;
    filterSidebar();
}

function setFiltersMenuVisible(visible) {
    $('#filters-menu').toggleClass('hidden', !visible);
}

function setFiltersMenuGroupOpen(group, open = undefined) {
    open = toggleChevron(group, open);
    const items = $(group).find('.group-items');
    items.toggleClass('hidden', !open);
    if (open) {
        $('.filter-group').filter(
            (_, g) => $(g).attr('key') !== $(group).attr('key')
        ).each((_, g) => setFiltersMenuGroupOpen(g, false));
    }
}

function searchFilterGroup(e, groupList) {
    const searchValue = e.target.value.toLowerCase();
    $(groupList).children().each((_, child) => {
        $(child).toggleClass('hidden', !$(child).attr('searchContent').toLowerCase().includes(searchValue));
    });
}

function toggleSidebarFilter(key, value, button) {
    const checked = toggleCheckbox(button);
    const filtersList = $('#filters-list');
    const filterId = `${key}-${value}`.replaceAll('.', '-').replaceAll('+', '-').replaceAll('~', '-').replaceAll('_', '-');
    if (!sidebarFilters[key]) sidebarFilters[key] = [];
    if (checked) {
        $(button).addClass('checked');
        sidebarFilters[key].push(value);
        const filterChip = $('<span>', {
            id: filterId,
            class: 'inline-flex max-w-full items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-foreground',
            title: 'Remove filter',
        });
        filterChip.append($('<span>', { class: 'uppercase tracking-wider text-muted-foreground', html: key }));
        filterChip.append($('<span>', { class: 'truncate font-mono', html: value }));
        filterChip.append($('<button>', { class: 'ml-0.5 rounded', html: 'X' }));
        filterChip.on('click', () => toggleSidebarFilter(key, value, button));
        filtersList.append(filterChip);
    } else {
        $(button).removeClass('checked');
        sidebarFilters[key] = sidebarFilters[key].filter((v) => v !== value);
        filtersList.find(`#${filterId}`).remove();
    }
    sidebarFiltersUpdated();
}

function clearAllSidebarFilters() {
    sidebarFilters = {};
    const menuContent = $('#filters-menu-content');
    menuContent.find('button.checked').each((index, button) => {
        $(button).removeClass('checked');
        toggleCheckbox(button);
    });
    const filtersList = $('#filters-list');
    filtersList.empty().append(filtersList.children().first());
    sidebarFiltersUpdated();
}

function sidebarFiltersUpdated() {
    const totalFilters = Object.values(sidebarFilters).reduce((sum, list) => sum + list.length, 0);
    const menuButton = $('#filters-menu-button');
    const filtersList = $('#filters-list');
    const filtersCount = $('#filters-count');
    filtersCount.html(totalFilters);
    if (totalFilters > 0) {
        menuButton.removeClass('border-input bg-background text-muted-foreground').addClass('border-primary/50 bg-primary/5 text-foreground');
        filtersList.removeClass('hidden');
        filtersCount.removeClass('hidden');
    } else {
        menuButton.addClass('border-input bg-background text-muted-foreground').removeClass('border-primary/50 bg-primary/5 text-foreground');
        filtersList.addClass('hidden');
        filtersCount.addClass('hidden');
    }
    filterSidebar();
}

function populateFiltersMenu() {
    const uniqueValues = getUniqueAttributeValues(Object.values(specData));
    const content = $('#filters-menu-content').empty();
    for (const key in uniqueValues) {
        // Exclude release from filters menu; "by release" tab should be used instead
        if (key !== 'release') {
            const keyGroup = $('<div>', {'class': 'rounded filter-group', key}).append(
                $('<button>', {
                    'class': 'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
                    click: () => setFiltersMenuGroupOpen(keyGroup),
                }).append(
                    $('.lucide-chevron-right').first().clone()
                ).append(
                    $('<span>', {'class': 'flex-1', text: key[0].toLocaleUpperCase() + key.slice(1)})
                ).append(
                    $('<span>', {'class': 'text-[10px] text-muted-foreground tabular-nums', text: uniqueValues[key].length})
                )
            );
            const groupItems = $('<div>', {
                'class': 'hidden group-items mb-1 border-l border-border pl-1',
                css: {'margin-left': '14px'},
            });
            const groupItemsList = $('<ul>', {'class': 'overflow-y-auto', css: {'max-height': '250px'}});
            if (uniqueValues[key].length > 10) {
                // Only add a search box if more than 10 values exist
                groupItems.append(
                    $('<div>', {'class': 'relative my-1 mr-1'}).append(
                        $('.lucide-search-mini').first().clone()
                    ).append(
                        $('<input>', {
                            'class': 'w-full rounded border border-input bg-background py-1 text-xs outline-none focus:ring-1 focus:ring-ring',
                            css: {'padding-left': '24px'},
                            type: 'search', 
                            placeholder: 'Search ' + key,
                        }).on('input', (e) => searchFilterGroup(e, groupItemsList))
                    )
                );
            }
            for (const value of uniqueValues[key].toSorted()) {
                const itemButton = $('<button>', {
                    'class': 'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent',
                }).append(
                    $('.checkbox-unchecked').first().clone()
                ).append(
                    $('<span>', {'class': 'truncate font-mono', text: value})
                )
                itemButton.on('click', () => toggleSidebarFilter(key, value, itemButton));
                const item = $('<li>').attr({searchContent: value}).append(itemButton);
                groupItemsList.append(item);
            }
            groupItems.append(groupItemsList);
            keyGroup.append(groupItems);
            content.append(keyGroup);
        }
    }
}

// Install Dialog
function toggleInstallDialogShown(hash) {
    const dialog = $('#install-dialog');
    const isHidden = dialog.hasClass('hidden');
    dialog.toggleClass('hidden', !isHidden);
    if (isHidden) {
        const command = $('#install-command');
        const packageInstallDetail = $('#package-install-detail');
        const hashInstallDetail = $('#hash-install-detail');
        if (hash) {
            command.html('spack install /' + hash);
            packageInstallDetail.addClass('hidden');
            hashInstallDetail.removeClass('hidden');
        } else {
            command.html('spack install ' + packageName);
            packageInstallDetail.removeClass('hidden');
            hashInstallDetail.addClass('hidden');
        }
    }
}

function toggleInstallDialogExpandedSection() {
    const expansionButton = $('#install-dialog-expansion-button');
    const expansionContent = $('#install-dialog-expansion-content');
    const open = toggleChevron(expansionButton.get(0));
    expansionContent.toggleClass('hidden', !open);
}

// Dependency Tree Dialog
function toggleDepTreeDialogShown(hash) {
    $('#deptree-dialog').toggleClass('hidden');
}

function createDepNode(dep, flat = false) {
    if (!dep.hash) return;
    const spec = specData[dep.hash];
    if (!spec) return;
    const isBuild = dep.parameters.deptypes?.includes('build');
    const isHidden = $('#hide-build-control').find('input').prop('checked');
    const li = $('<li>', {'class': isBuild ? (isHidden ? 'hidden build-dep' : 'build-dep') : ''});
    const title = $('<div>', {'class': 'group flex items-center justify-between gap-1 rounded px-1 py-0.5 hover:bg-accent/40'})
    const titleLeft = $('<div>', {'class': 'group flex items-center'});
    const titleRight = $('<div>');
    const hashLabel = $('<span>', {'class': 'truncate px-3 text-muted-foreground font-mono', text: dep.hash.slice(0, shortHashLength)});
    const titleLabel = $('<span>', {'class': 'truncate font-mono', text: dep.name + '@' + spec.version});
    const openButton = $('<a>', {
        target: '_blank', 
        href: '/?package=' + dep.name + '&hash=' + dep.hash,
        click: (e) => e.stopPropagation(),
    }).append(
        $('.lucide-open').first().clone()
    );
    const depTypeChips = $('<div>', {'class': 'flex gap-1'});
    for (depType of dep.parameters.deptypes) {
        depTypeChips.append($('<div>', {'class': 'inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs', text: depType}));
    }
    titleRight.append(depTypeChips);
    title.append(titleLeft).append(titleRight);

    if (!flat && spec.dependencies.length) {
        titleLeft.append($('.lucide-chevron-right').first().clone()).append(openButton).append(hashLabel).append(titleLabel);
        li.append(title);
        const subdepGroup = $('<ul>', {'class': 'collapsed spec-y-0.5', css: {'padding-left': '12px'}});
        li.append(subdepGroup);
        title.on('click', () => {
            if (!subdepGroup.children().length) {
                for (const subdep of spec.dependencies.toSorted((a, b) => a.name.localeCompare(b.name))) {
                    const subdepNode = createDepNode(subdep);
                    if (subdepNode) subdepGroup.append(subdepNode);
                }
            }
            subdepGroup.toggleClass('collapsed', !toggleChevron(title));
        })
    } else {
        const dotIcon = $('.lucide-dot').first().clone();
        titleLeft.append(dotIcon).append(openButton).append(hashLabel).append(titleLabel);
        li.append(title);
    }
    return li;
}

function flattenDepTree(deps, flat) {
    for (const dep of deps) {
        if (dep.hash && !flat[dep.hash]) {
            flat[dep.hash] = dep;
            const spec = specData[dep.hash];
            if (!spec) continue;
            if (spec.dependencies.length) {
                flat = flattenDepTree(spec.dependencies, flat);
            }
        }
    }
    return flat;
}

function createToggleControl(id, label, callback) {
    const controlCheck = $('<input>', {type: 'checkbox'});
    controlCheck.on('change', () => {
        callback($(controlCheck).prop('checked'));
    });
    return $('<label>', {id, 'class': 'flex cursor-pointer items-center gap-2 text-xs text-muted-foreground py-2'}).append(
        $('<label>', {'class': 'switch'}).append(controlCheck).append(
            $('<span>', {'class': 'slider'})
        )
    ).append(
        $('<span>', {text: label})
    );
}

function populateDepTreeDialog(spec, deps) {
    const dialog = $('#deptree-dialog');
    const tree = $('#deptree').empty();
    const mainTree = $('<div>');
    const flatTree = $('<div>', {'class': 'hidden'});
    const treeControls = $('<div>', {'class': 'flex items-center justify-between'});
    treeControls.append(createToggleControl('flatten-control', 'Flatten & Deduplicate', (checked) => {
        mainTree.toggleClass('hidden', checked);
        flatTree.toggleClass('hidden', !checked);
    }));
    treeControls.append(createToggleControl('hide-build-control', 'Hide Build Deps', (checked) => {
        const buildDepNodes = $(dialog).find('.build-dep');
        buildDepNodes.each((i, item) => $(item).toggleClass('hidden', checked));
    }));
    tree.append(treeControls);

    $(dialog).find('#curr-spec-version').html(spec.version);
    $(dialog).find('#num-direct-deps').html(deps.length);
    for (const dep of deps.toSorted((a, b) => a.name.localeCompare(b.name))) {
        const depNode = createDepNode(dep);
        if (depNode) $(mainTree).append(depNode);
    }
    const flattened = flattenDepTree(deps, {});
    dialog.find('#num-unique-transitive-deps').html(Object.keys(flattened).length);
    for (const dep of Object.values(flattened)) {
        const flatDepNode = createDepNode(dep, flat = true);
        if (flatDepNode) $(flatTree).append(flatDepNode);
    }
    tree.append(mainTree, flatTree);
}

function createDepTreeDialogButton(spec, deps) {
    if (!deps.length) return noDiffMessage;
    return $('<button>', {
        'class': 'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
        click: () => {
            populateDepTreeDialog(spec, deps);
            toggleDepTreeDialogShown();
        },
    }).append(
        $('.lucide-git-branch').first().clone()
    ).append(
        $('<span>', {text: deps.length + (deps.length > 1 ? ' deps' : ' dep')})
    );
}

// Specs Table
function toggleDiffMode() {
    diffMode = !diffMode;
    const button = $('#diff-mode-button');
    if (diffMode) {
        button.addClass('border-primary/40 bg-primary/10 text-primary');
        button.children().eq(1).html('Show all values');
        const eyeOffIcon = $('.lucide-eye-off').first().clone();
        button.children().eq(0).replaceWith(eyeOffIcon);
    } else {
        button.removeClass('border-primary/40 bg-primary/10 text-primary');
        button.children().eq(1).html('Hide common values');
        const eyeOnIcon = $('.lucide-eye-on').first().clone();
        button.children().eq(0).replaceWith(eyeOnIcon);
    }
    updateTable();
}

function createFilterBadge(key, value, remove) {
    const badge = $('<div>', {'class': 'group inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20'}).append(
        $('<label>', {'class': 'text-primary/70', css: {'text-transform': 'capitalize'}, text: key + ': '})
    ).append($('<label>', {text: value}));
    if (remove) badge.append($('.lucide-close').first().clone().removeClass('h-4 w-4').addClass('h-3 w-3'));
    return badge;
}

function updateBadgeOptions() {
    badgeOptions = getUniqueAttributeValues(currentSpecs);
    const container = $('#badge-options-list').empty();
    for (const key in badgeOptions) {
        container.append($('<div>', {
            'class': 'sticky top-0 bg-surface-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
            text: key,
        }).attr({searchContent: badgeOptions[key].join(',')}));
        for (value of badgeOptions[key]) {
            // Copy key and value for click function
            const [k, v] = [key, value];
            container.append($('<button>', {
                text: value,
                'class': 'flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground',
                click: () => { addBadgeFilter(k, v) }
            }).attr({searchContent: value}));
        }
    }
    filterBadgeOptions();
}

function setBadgeOptionsMenuVisible(visible) {
    $('#badge-options-menu').toggleClass('hidden', !visible);
}

function addBadgeFilter(column, label) {
    if (!badgeFilters[column].includes(label)) {
        badgeFilters[column].push(label);
        syncRoute();
    }
}

function removeBadgeFilter(column, label) {
    badgeFilters[column] = badgeFilters[column].filter((l) => l !== label);
    syncRoute();
}

function badgeFiltersUpdated() {
    const container = $('#badge-filters').empty();
    for (const key in badgeFilters) {
        for (const value of badgeFilters[key]) {
            const badge = createFilterBadge(key, value, true);
            $(badge).on('click', () => removeBadgeFilter(key, value));
            container.append(badge);
        }
    }
}

function filterBadgeOptions() {
    const filterString = ($('#badge-options-filter').val() || '').toLowerCase();
    $('#badge-options-list').children().each((_, child) => {
        $(child).toggleClass('hidden', filterString.length > 0 && !$(child).attr('searchContent').toLowerCase().includes(filterString));
    });
}

function groupBadges(rowId, column, data, link = false) {
    const id = `row-${rowId}-${column}`;
    const container = $('<div>', {id, css: {display: 'flex', 'flex-wrap': 'wrap'}});
    const expand = expandedCells.includes(container.id);
    data.forEach((d, i) => {
        let badge = null
        if (d === noDiffMessage) {
            badge = $('<div>', {text: d});
        } else if (link) {
            badge = $('<a>', {href: d.link, text: d.label, css: {'text-decoration': 'underline'}, 'class': 'pl-2'});
        } else {
            badge = $('<button>', {
                'class': (
                    badgeFilters[column].includes(d)
                    ? 'group inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20'
                    : 'inline-flex max-w-full items-center rounded text-left text-xs transition-colors border border-transparent px-1.5 py-0.5 underline decoration-dashed decoration-primary/40 underline-offset-[3px] hover:border-pill-border hover:bg-pill-bg hover:text-foreground hover:no-underline'
                ),
                click: () => addBadgeFilter(column, d),
                text: d,
            });
        }
        if (i >= maxBadges) {
            badge.addClass('hidden');
            if (expand) badge.css({display: 'inline-block'})
        }
        container.append(badge);
    });
    if (data.length > maxBadges) {
        container.append($('<button>', {
            'class': 'toggle text-xs pl-2',
            text: expand ? 'Show Less' : '... Show ' + (data.length - maxBadges) +' More',
            click: (e) => showMoreBadges(e, data.length - maxBadges, container.id),
        }));
    }
    return container;
}

function showMoreBadges(e, n, id) {
    const target = e.target;
    const visible = target.innerHTML === 'Show Less';
    const container = $(target).parent();
    target.innerHTML = visible ? `... Show ${n} More` : 'Show Less';
    container.children().slice(maxBadges).each((_, item) => {
        if (!$(item).hasClass('toggle')) $(item).toggleClass('hidden')
    });
}

function displayHash(hash) {
    const copyIcon = $('.lucide-copy').first().clone();
    const checkIcon = $('.lucide-check').first().clone();
    return $('<div>', {css: {display: 'contents'}}).append(
        $('<button>', {
            'class': 'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground',
            css: {'margin-right': '22px'},
            click: () => toggleInstallDialogShown(hash),
        }).append(
            $('.lucide-download').first().clone()
        ).append(
            $('<span>', {text: 'Install'})
        )
    ).append(
        $('<button>', {
            'class': 'inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary',
            title: hash.toLowerCase(),
            click: () => {
                navigator.clipboard.writeText(hash);
                copyIcon.replaceWith(checkIcon);
                setTimeout(() => {
                    checkIcon.replaceWith(copyIcon);
                }, 3000);
            }
        }).append(
            $('<span>', {'class': 'truncate', text: hash.slice(0, shortHashLength)})
        ).append(copyIcon)
    );
}

function setupColumnVisibilityOptions(columns) {
    const container = $('#columns-menu');
    const table = $('#cache').DataTable();
    for (const col in columns) {
        const visible = columns[col];
        const colIndex = table.columns().names().indexOf(col);
        table.column(colIndex).visible(visible);
        const item = $('<label>', {'class':  'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent'}).append(
            $('<input>', {type: 'checkbox', checked: visible, 'class': 'h-3.5 w-3.5 accent-primary'}).on('input', () => {
                const currentVisibility = table.column(colIndex).visible();
                if (currentVisibility) {
                    table.column(colIndex).visible(false);
                    item.removeClass('checked');
                } else {
                    table.column(colIndex).visible(true);
                    item.addClass('checked');
                }
                updateCommonValues(undefined);
            })
        ).append($('<span>', {text: col}));
        container.append(item);
    }
}

function setColumnsMenuVisible(visible) {
    $('#columns-menu-wrapper').toggleClass('hidden', !visible);
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
                    return displayHash(data).get(0);
                },
            },
            {
                name: 'version',
                data: 'version',
                className: 'dt-left',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'version', [data]).get(0);
                }
            },
            {
                name: 'releases',
                data: 'releases',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'release', data).get(0);
                },
            },
            {
                name: 'stacks',
                data: 'stacks',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'stack', data).get(0);
                },
            },
            {
                name: 'variants',
                data: 'variants',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'variant', data).get(0);
                },
            },
            {
                name: 'platform',
                data: 'platform',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'platform', [data]).get(0);
                },
            },
            {
                name: 'os',
                data: 'os',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'os', [data]).get(0);
                },
            },
            {
                name: 'target',
                data: 'target',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'target', [data]).get(0);
                },
            },
            {
                name: 'dependencies',
                data: 'dependencies',
                render: function (data, type, row, info) {
                    return createDepTreeDialogButton(row, data).get(0);
                },
            },
        ],
        responsive: {
            details: {
                renderer: function (api, rowIdx, columns) {
                    let container = $('<div>');
                    for (const column of columns) {
                        if (column.hidden) {
                            const row = $('<div>', {'class': 'flex'}).append(
                                $('<div>', {text: column.title, 'class': 'table-responsive-column-label'})
                            ).append(column.data);
                            container.append(row);
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
    });
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
                    const dv = d[key].map((k) => k.label ? k.label : k);
                    return dv.includes(v);
                })) {
                    common[key].push(v);
                }
            }
        } else if (filteredData.every((d) => d[key] === value)) {
            common[key].push(value);
        }
    }
    const badgeFiltersContainer = $('#badge-filters');
    for (const key in common) {
        let keyName = key;
        if (keyName !== 'os' && keyName.endsWith('s')) keyName = keyName.slice(0, -1);
        const colIndex = table.columns().names().indexOf(key);
        if (table.column(colIndex).visible()) {
            for (const value of common[key]) {
                if (badgeFilters[keyName] && !badgeFilters[keyName].includes(value)) {
                    const container = $('<span>', {
                        class: 'inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs'
                    }).append(
                        $('<span>', { class: 'text-muted-foreground', html: keyName + ': ' })
                    ).append($('<span>', { html: value }));
                    badgeFiltersContainer.append(container);
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
    $('.num-table-rows').text(filteredData.length.toLocaleString());
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
