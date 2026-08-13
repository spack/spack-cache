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
    let filterMatchSpecs = {};
    const totalFilters = Object.values(sidebarFilters).reduce((sum, list) => sum + list.length, 0);
    if (totalFilters > 0 && uniqueAttrValues) {
        for (key in sidebarFilters) {
            for (value of sidebarFilters[key]) {
                const packageSpecHashes = uniqueAttrValues[pluralColumns[key] || key][value];
                for (pName in packageData) {
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
    }
    $('.sidebar-item').each((_, item) => {
        const itemPackage = $(item).attr('package').toLowerCase();
        const itemRelease = $(item).attr('release');
        let match = filterString.endsWith('$') ? itemPackage.endsWith(filterString.slice(0, -1)) : itemPackage.includes(filterString);
        const [label, specCount] = item.children;
        if (totalFilters > 0) {
            const matchedSpecs = filterMatchSpecs[itemPackage];
            match &&= matchedSpecs?.size;
            if (matchedSpecs) {
                if (itemRelease) $(specCount).text(
                    matchedSpecs.intersection(new Set(packageData[itemPackage].specs[itemRelease])).size
                );
                else $(specCount).text(matchedSpecs.size);
            }
        } else {
            if (itemRelease) $(specCount).text(packageData[itemPackage].specs[itemRelease].length);
            else $(specCount).text(getAllSpecHashesForPackage(itemPackage).length);
        }
        if (match && $(specCount).text() > 0) {
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

const debouncedFilterSidebar = debounce((event) => filterSidebar(event))

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
    }).append($('<code>', { text: pkg.uid })).append(
        $('<span>', {
            'class': 'text-muted-foreground spec-counter',
            text: releaseName ? pkg.specs[releaseName].length : getAllSpecHashesForPackage(pkg.uid).length,
        })
    );
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
    const clearAllButton = filtersList.children().eq(0);
    filtersList.empty().append(clearAllButton);
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