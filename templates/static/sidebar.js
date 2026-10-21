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

function highlightSidebarItems() {
    for (const item of sidebarItems) {
        const isActive = item.package === packageName && (!item.release || badgeFilters.release.includes(item.release));
        item.element.classList.toggle('active', isActive);
    }
}

function applySidebarHighlights() {
    highlightSidebarItems();
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

let filterMatchSpecsCache = null;
// Sidebar items with the state last written to the DOM, so that filtering
// only touches elements that change, and only those in the visible tab.
let sidebarItems = [];

function invalidateFilterMatchSpecsCache() {
    filterMatchSpecsCache = null;
}

function filterSidebar() {
    let resultsFound = false;
    const filterString = ($('#sidebar-search').val() || '').toLowerCase();
    const emphasisString = filterString.replace('$', '');
    const totalFilters = Object.values(sidebarFilters).reduce((sum, list) => sum + list.length, 0);
    if (totalFilters > 0 && uniqueAttrValues && !filterMatchSpecsCache) {
        const filterMatchSpecs = {};
        for (const key in sidebarFilters) {
            for (const value of sidebarFilters[key]) {
                const packageSpecHashes = uniqueAttrValues[key][value];
                for (const pName in packageData) {
                    if (pName in packageSpecHashes) {
                        const specHashes = new Set(packageSpecHashes[pName]);
                        if (!filterMatchSpecs[pName]) filterMatchSpecs[pName] = specHashes;
                        else filterMatchSpecs[pName] = filterMatchSpecs[pName].intersection(specHashes);
                    } else {
                        filterMatchSpecs[pName] = new Set();
                    }
                }
            }
        }
        filterMatchSpecsCache = filterMatchSpecs;
    }
    const filterMatchSpecs = filterMatchSpecsCache || {};
    const activeTab = $('#by-release-content').hasClass('active') ? 'by-release' : 'all-packages';
    const groupCounts = {};
    for (const item of sidebarItems) {
        const itemPackageLower = item.packageLower;
        let match = filterString.endsWith('$') ? itemPackageLower.endsWith(filterString.slice(0, -1)) : itemPackageLower.includes(filterString);
        let count = 0;
        if (totalFilters > 0) {
            const matchedSpecs = filterMatchSpecs[item.package];
            match &&= matchedSpecs?.size;
            if (matchedSpecs) {
                count = item.release
                    ? matchedSpecs.intersection(new Set(uniqueAttrValues.release[item.release][item.package])).size
                    : matchedSpecs.size;
            }
        } else {
            count = item.release ? packageData[item.package].releases[item.release] : packageData[item.package].count;
        }
        const visible = Boolean(match && count > 0);
        if (visible) {
            resultsFound = true;
            if (item.release) {
                if (!groupCounts[item.release]) groupCounts[item.release] = { items: 0, specs: 0 };
                groupCounts[item.release].items += 1;
                groupCounts[item.release].specs += count;
            }
        }
        if ((item.release ? 'by-release' : 'all-packages') === activeTab) {
            const emphasis = visible ? emphasisString : '';
            if (item.count !== count) {
                item.counter.textContent = count;
                item.count = count;
            }
            if (item.emphasis !== emphasis) {
                const matchIndex = emphasis.length > 0 ? itemPackageLower.indexOf(emphasis) : -1;
                item.label.innerHTML = matchIndex !== -1
                    ? item.package.slice(0, matchIndex) + `<span class='font-bold text-foreground'>${item.package.slice(matchIndex, matchIndex + emphasis.length)}</span>` + item.package.slice(matchIndex + emphasis.length)
                    : item.package;
                item.emphasis = emphasis;
            }
            if (item.visible !== visible) {
                item.element.classList.toggle('hidden', !visible);
                item.visible = visible;
            }
        }
    }
    $('.sidebar-group').each((_, group) => {
        const groupRelease = $(group).attr('release');
        const { items, specs } = groupCounts[groupRelease] || { items: 0, specs: 0 };
        $(group).find('.child-counter').text(specs);
        if (items && (showDevs || !groupRelease.includes('develop'))) {
            $(group).removeClass('hidden');
            if (emphasisString.length > 0) $(group).removeClass('collapsed');
        } else {
            $(group).addClass('hidden collapsed');
        }
    });
    $('#all-packages-nodata').css('display', resultsFound ? 'none' : 'block');
    $('#by-release-nodata').css('display', resultsFound ? 'none' : 'block');
}

const debouncedFilterSidebar = debounce((event) => filterSidebar(event), 50)

function selectSidebarTab(tab) {
    ['#sidebar-tabs', '#sidebar-tab-contents'].forEach((setName) => {
        $(setName).children().each((_, item) => {
            $(item).toggleClass('active', item.id.includes(tab));
        });
    });
    if (tab === 'by-release') populateByReleaseTab();
    // Items in the previously hidden tab may be out of date
    if (sidebarItems.length) filterSidebar();
}

let byReleasePopulated = false;

function sortedPackageNames() {
    return Object.keys(packageData).toSorted((a, b) => a.localeCompare(b));
}

function populateSidebarTabs() {
    if (!packageData) return;
    // Build the items as HTML strings with a single delegated click handler:
    // creating them one by one with jQuery is slow, and per-item handlers
    // create a lot of garbage for the browser to collect.
    $('#all-packages-list').html(sortedPackageNames().map((name) => createSidebarItem(name, undefined)).join(''));
    $('#all-packages-list, #by-release-list').on('click', '.sidebar-item', (e) => {
        e.stopPropagation();
        closeAllMenus();
        const newUrl = new URL(basePath, window.location.origin);
        newUrl.searchParams.append('package', e.currentTarget.getAttribute('package'));
        const releaseName = e.currentTarget.getAttribute('release');
        if (releaseName) newUrl.searchParams.append('release', releaseName);
        for (const key in sidebarFilters) {
            for (const value of sidebarFilters[key]) {
                newUrl.searchParams.append(key, value);
            }
        }
        window.history.pushState(null, '', newUrl.toString());
    });
    collectSidebarItems();
    $('#all-packages-loading, #by-release-loading').hide();
    $('#show-devs-toggle').prop('checked', showDevs);
    filterSidebar();
}

function populateByReleaseTab() {
    // This tab holds ~90% of the sidebar items, which slows down every layout
    // of the page, so only build it once it is shown.
    if (byReleasePopulated || !packageData) return;
    byReleasePopulated = true;
    const releaseItems = {};
    for (const name of sortedPackageNames()) {
        for (const releaseName in packageData[name].releases) {
            if (!releaseItems[releaseName]) releaseItems[releaseName] = [];
            releaseItems[releaseName].push(createSidebarItem(name, releaseName));
        }
    }
    $('#by-release-list').empty().append(...Object.keys(releaseItems).toSorted(
        (a, b) => b.localeCompare(a)
    ).map((releaseName) => {
        const group = createSidebarGroup(releaseName);
        group.children().eq(1).html(releaseItems[releaseName].join(''));
        return group;
    }));
    collectSidebarItems();
    highlightSidebarItems();
}

function collectSidebarItems() {
    sidebarItems = Array.from(document.querySelectorAll('.sidebar-item'), (element) => ({
        element,
        label: element.children[0],
        counter: element.children[1],
        package: element.getAttribute('package'),
        packageLower: element.getAttribute('package').toLowerCase(),
        release: element.getAttribute('release') || undefined,
        count: parseInt(element.children[1].textContent),
        emphasis: '',
        visible: true,
    }));
}

function createSidebarItem(name, releaseName) {
    const pkg = packageData[name];
    const count = releaseName ? pkg.releases[releaseName] : pkg.count;
    const release = releaseName ? ` release="${releaseName}"` : '';
    return `<li class="sidebar-item flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground" package="${name}"${release}>`
        + `<code>${name}</code><span class="text-muted-foreground spec-counter">${count}</span></li>`;
}

function createSidebarGroup(groupName) {
    // Clone svg nodes rather than creating them in JS
    const downChevronIcon = $('.lucide-chevron-down').first().clone();
    const tagIcon = $('.lucide-tag').first().clone();
    $(tagIcon).removeClass('h-5 w-5').addClass('h-3.5 w-3.5 text-primary');

    const group = $('<li>', { 'class': 'sidebar-group' }).attr({
        release: groupName
    })
    const groupTitle = $('<div>', { 'class': 'flex items-center' }).append(
        $('<button>', {
            'class': 'flex flex-1 items-center gap-1 rounded px-1.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground',
            click: () => { toggleSidebarGroup(group) },
        }).append(downChevronIcon).append(tagIcon).append(
            $('<span>', { 'class': 'truncate font-medium text-sm', text: groupName })
        ).append(
            $('<span>', { 'class': 'ml-auto text-xs text-muted-foreground child-counter' })
        )
    )
    group.append(groupTitle).append(
        $('<ul>', { 'class': 'nested border-l border-border pl-1' })
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
    const clearAllButton = filtersList.children().eq(0);
    filtersList.empty().append(clearAllButton);
    sidebarFiltersUpdated();
}

function sidebarFiltersUpdated() {
    invalidateFilterMatchSpecsCache();
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

function loadFiltersMenu() {
    if (uniqueAttrValues || uniqueAttrValuesPending) return;
    uniqueAttrValuesPending = true;
    fetchJson(`${basePath}/api/filters.json`).then((data) => {
        uniqueAttrValues = data;
        populateFiltersMenu();
    }).catch((err) => {
        console.error('Failed to load filter data:', err);
        uniqueAttrValuesPending = false;
    });
}

function populateFiltersMenu() {
    const uniqueValues = Object.fromEntries(Object.entries(uniqueAttrValues).map(([key, valuesMap]) => {
        return [key, Object.keys(valuesMap)]
    }));
    const content = $('#filters-menu-content').empty();
    for (const key in uniqueValues) {
        // Exclude release from filters menu; "by release" tab should be used instead
        if (key !== 'release') {
            const keyGroup = $('<div>', { 'class': 'rounded filter-group', key }).append(
                $('<button>', {
                    'class': 'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
                    click: () => setFiltersMenuGroupOpen(keyGroup),
                }).append(
                    $('.lucide-chevron-right').first().clone()
                ).append(
                    $('<span>', { 'class': 'flex-1', text: key[0].toLocaleUpperCase() + key.slice(1) })
                ).append(
                    $('<span>', { 'class': 'text-[10px] text-muted-foreground tabular-nums', text: uniqueValues[key].length })
                )
            );
            const groupItems = $('<div>', {
                'class': 'hidden group-items mb-1 border-l border-border pl-1',
                css: { 'margin-left': '14px' },
            });
            const groupItemsList = $('<ul>', { 'class': 'overflow-y-auto', css: { 'max-height': '250px' } });
            if (uniqueValues[key].length > 10) {
                // Only add a search box if more than 10 values exist
                groupItems.append(
                    $('<div>', { 'class': 'relative my-1 mr-1' }).append(
                        $('.lucide-search-mini').first().clone()
                    ).append(
                        $('<input>', {
                            'class': 'w-full rounded border border-input bg-background py-1 text-xs outline-none focus:ring-1 focus:ring-ring',
                            css: { 'padding-left': '24px' },
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
                    $('<span>', { 'class': 'truncate font-mono', text: value })
                )
                itemButton.on('click', () => toggleSidebarFilter(key, value, itemButton));
                const item = $('<li>').attr({ searchContent: value }).append(itemButton);
                groupItemsList.append(item);
            }
            groupItems.append(groupItemsList);
            keyGroup.append(groupItems);
            content.append(keyGroup);
        }
    }
}