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
    const badge = $('<div>', { 'class': 'group inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20' }).append(
        $('<label>', { 'class': 'text-primary/70', css: { 'text-transform': 'capitalize' }, text: key + ': ' })
    ).append($('<label>', { text: value }));
    if (remove) badge.append($('.lucide-close').first().clone().removeClass('h-4 w-4').addClass('h-3 w-3'));
    return badge;
}

function updateBadgeOptions() {
    if (!uniqueAttrValues || !packageName) return;
    const badgeOptions = Object.fromEntries(Object.entries(uniqueAttrValues).map(([key, valueMap]) => {
        return [key, Object.entries(valueMap).filter(([value, packageMap]) => {
            return packageMap[packageName]?.length
        }).map(([value]) => value)];
    }));
    const container = $('#badge-options-list').empty();
    for (const key in badgeOptions) {
        container.append($('<div>', {
            'class': 'sticky top-0 bg-surface-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
            text: key,
        }).attr({ searchContent: badgeOptions[key].join(',') }));
        for (value of badgeOptions[key]) {
            // Copy key and value for click function
            const [k, v] = [key, value];
            container.append($('<button>', {
                text: value,
                'class': 'flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground',
                click: () => { addBadgeFilter(k, v) }
            }).attr({ searchContent: value }));
        }
    }
    filterBadgeOptions();
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
    const container = $('<div>', { id, css: { display: 'flex', 'flex-wrap': 'wrap' } });
    const expand = expandedCells.includes(id);
    data.forEach((d, i) => {
        let badge = null
        if (d === noDiffMessage) {
            badge = $('<div>', { text: d });
        } else if (link) {
            badge = $('<a>', { href: d.link, text: d.label, css: { 'text-decoration': 'underline' }, 'class': 'pl-2' });
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
            if (expand) badge.css({ display: 'inline-block' })
        }
        container.append(badge);
    });
    if (data.length > maxBadges) {
        container.append($('<button>', {
            'class': 'toggle text-xs pl-2',
            text: expand ? 'Show Less' : '... Show ' + (data.length - maxBadges) + ' More',
            click: (e) => showMoreBadges(e, data.length - maxBadges, id),
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
    return $('<div>', { css: { display: 'contents' } }).append(
        $('<button>', {
            'class': 'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground',
            css: { 'margin-right': '22px' },
            click: () => toggleInstallDialogShown(hash),
        }).append(
            $('.lucide-download').first().clone()
        ).append(
            $('<span>', { text: 'Install' })
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
            $('<span>', { 'class': 'truncate', text: hash.slice(0, shortHashLength) })
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
        const item = $('<label>', { 'class': 'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent' }).append(
            $('<input>', { type: 'checkbox', checked: visible, 'class': 'h-3.5 w-3.5 accent-primary' }).on('input', () => {
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
        ).append($('<span>', { text: col }));
        container.append(item);
    }
}

function asNode(jqElement) {
    return jqElement.get(0);
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
                    return asNode(displayHash(data));
                },
            },
            {
                name: 'version',
                data: 'version',
                className: 'dt-left',
                render: function (data, type, row, info) {
                    return asNode(groupBadges(info.row, 'version', [data]));
                }
            },
            {
                name: 'releases',
                data: 'releases',
                render: function (data, type, row, info) {
                    return asNode(groupBadges(info.row, 'release', data));
                },
            },
            {
                name: 'stacks',
                data: 'stacks',
                render: function (data, type, row, info) {
                    return asNode(groupBadges(info.row, 'stack', data));
                },
            },
            {
                name: 'variants',
                data: 'variants',
                render: function (data, type, row, info) {
                    return asNode(groupBadges(info.row, 'variant', data));
                },
            },
            {
                name: 'platform',
                data: 'platform',
                render: function (data, type, row, info) {
                    return asNode(groupBadges(info.row, 'platform', [data]));
                },
            },
            {
                name: 'os',
                data: 'os',
                render: function (data, type, row, info) {
                    return asNode(groupBadges(info.row, 'os', [data]));
                },
            },
            {
                name: 'target',
                data: 'target',
                render: function (data, type, row, info) {
                    return asNode(groupBadges(info.row, 'target', [data]));
                },
            },
            {
                name: 'dependencies',
                data: 'dependencies',
                render: function (data, type, row, info) {
                    return asNode(createDepTreeDialogButton(row, data));
                },
            },
        ],
        responsive: {
            details: {
                renderer: function (api, rowIdx, columns) {
                    let container = $('<div>');
                    for (const column of columns) {
                        if (column.hidden) {
                            const row = $('<div>', { 'class': 'flex' }).append(
                                $('<div>', { text: column.title, 'class': 'table-responsive-column-label' })
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
        variants: true,
        platform: true,
        os: true,
        target: true,
        dependencies: true,
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