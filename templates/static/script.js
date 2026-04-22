let basePath = undefined;
let packageData = undefined;
let specData = undefined;
let treeData = undefined;
let packageName = undefined;
let currentSpecs = undefined;
let sidebarMinWidth = 250;
let sidebarMaxWidth = 800;
let badgeFilters = {
    version: [],
    variant: [],
    platform: [],
    os: [],
    target: [],
    stack: [],
    tag: [],
};
const pluralColumns = {
    variant: 'variants',
    tag: 'tags',
    stack: 'stacks',
}
const maxBadges = 3;
let tableInitialized = false;
let expandedCells = [];
let diffMode = false;
const noDiffMessage = 'No diff';


// General
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
            badgeFilters = Object.fromEntries(
                Object.keys(badgeFilters).map((key) => [key, urlParams.getAll(key)])
            )
            badgeFiltersUpdated();
            updateTable();
        }
    }
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
    currentSpecs = packageData[packageName].specs.map((hash) => specData[hash]);
    document.getElementById('package-name').innerHTML = name;
    document.getElementById('package-link').href = "https://packages.spack.io/package.html?name=" + name;
}

function toggleMenu(menuId) {
    const menu = document.getElementById(menuId);
    if (menu.style.display === "block") {
        menu.style.display = "none";
    } else {
        menu.style.display = "block";
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

// Tree
function setTreeOrganization(organization) {
    document.getElementById('tree-organization').innerHTML = organization
    document.getElementById('tree-root').innerHTML = 'Loading tree...'
    loadTree(organization)
}

function setTreeNodeOpen(node, open) {
    if (open) {
        node.classList.remove('collapsed')
    } else {
        node.classList.add('collapsed')
    }
}

function toggleTreeNode(node) {
    setTreeNodeOpen(node, node.classList.contains('collapsed'))
}

function setAllNodesOpen(open) {
    const nodes = Array.from(document.getElementsByClassName('tree-node'));
    nodes.forEach((node) => setTreeNodeOpen(node, open));
}

function setElementChildren(element, children) {
    element.innerHTML = ''
    for (let i = 0; i < children.length; i++) {
        element.appendChild(children[i])
    }
}

function treeNavigate(item) {
    const newUrl = basePath + `?package=${item.name}&tag=${item.tag}&stack=${item.stack}`;
    window.history.pushState(null, '', newUrl);
}

function generateTreeNodes(items) {
    const nodes = []
    for (let i = 0; i < items.length; i++) {
        const node = document.createElement('li')
        const node_title = document.createElement('span')
        const item = items[i];
        node_title.innerHTML = item.name;
        node.appendChild(node_title)

        const children = items[i].children
        if (children) {
            node_title.classList.add('caret')
            node_title.addEventListener('click', () => toggleTreeNode(node))
            const children_container = document.createElement('ul')
            children_container.classList.add('nested')
            const child_nodes = generateTreeNodes(children)
            setElementChildren(children_container, child_nodes)
            node.appendChild(children_container)
            node.classList.add('collapsed')
            node.searchContent = child_nodes.map((node) => node.searchContent).join(' ')
            node_title.innerHTML += ` (${child_nodes.length})`
        } else {
            node.onclick = () => treeNavigate(item);
            node.classList.add('tree-leaf')
            node.searchContent = item.name
        }
        node.classList.add('tree-node')
        nodes.push(node)
    }
    return nodes
}

function organizeTreeData(data, organization) {
    let firstAttr = 'tag'
    let secondAttr = 'stack'
    if (organization === 'Stack -> Tag') {
        firstAttr = 'stack'
        secondAttr = 'tag'
    }
    const hierarchy = {}
    for (let i = 0; i < data.length; i++) {
        const first = data[i][firstAttr]
        const second = data[i][secondAttr]
        if (!hierarchy[first]) hierarchy[first] = {}
        if (!hierarchy[first][second]) hierarchy[first][second] = []
        hierarchy[first][second].push(data[i])
    }
    const treeItems = Object.entries(hierarchy).map(([key1, level1]) => ({
        name: key1,
        children: Object.entries(level1).map(([key2, level2]) => ({
            name: key2,
            children: level2.sort((a, b) => a.name > b.name)
        }))
    }))
    return treeItems
}

function loadTree(organization) {
    const organized = organizeTreeData(treeData, organization)
    const tree_nodes = generateTreeNodes(organized)
    const tree_root = document.getElementById('tree-root')
    setElementChildren(tree_root, tree_nodes)
}

function filterTree(e) {
    const search = document.getElementById('tree-search')
    let filterString = search.value
    const nodes = Array.from(document.getElementsByClassName('tree-node'))
    nodes.forEach((node) => {
        if (node.searchContent.toLowerCase().includes(filterString.toLowerCase())) {
            node.classList.remove('hidden')
        } else {
            node.classList.add('hidden')
        }
    })
}

// Specs Table
function toggleDiffMode() {
    diffMode = !diffMode;
    const toggle = document.getElementById('diff-mode-toggle');
    toggle.checked = diffMode;
    updateTable();
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
            const badge = document.createElement('div');
            badge.classList.add('tag', 'searchable-badge');

            const labels = document.createElement('div');
            labels.classList.add('labels');
            const keyLabel = document.createElement('label');
            keyLabel.classList.add('label-text-alt', 'text-[10px]', 'label', 'floating');
            keyLabel.innerHTML = key;
            labels.appendChild(keyLabel);
            const valueLabel = document.createElement('label');
            valueLabel.innerHTML = value;
            labels.appendChild(valueLabel);
            badge.appendChild(labels);

            const removeIcon = document.createElement('div');
            removeIcon.classList.add('remove-icon');
            removeIcon.innerHTML = 'X';
            badge.appendChild(removeIcon);
            badge.onclick = () => removeBadgeFilter(key, value);
            container.appendChild(badge);
        }
    }
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
            badge.classList.add('tag', 'searchable-badge');
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
        showMore.classList.add('btn', 'btn-xs', 'btn-ghost', 'normal-case', 'pl-2')
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
                data: 'hash',
                render: function (data, type, row, info) {
                    return '<span class="font-mono">' + data + '</span>';
                },
            },
            {
                data: 'version',
                className: 'dt-left',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'version', [data]);
                }
            },
            {
                data: 'tags',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'tag', data);
                },
            },
            {
                data: 'stacks',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'stack', data);
                },
            },
            {
                data: 'variants',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'variant', data);
                },
            },
            {
                data: 'dependencies',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'dependency', data, true);
                },
            },
            {
                data: 'platform',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'platform', [data]);
                },
            },
            {
                data: 'os',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'os', [data]);
                },
            },
            {
                data: 'target',
                render: function (data, type, row, info) {
                    return groupBadges(info.row, 'target', [data]);
                },
            },
        ],
    });
    tableInitialized = true;
}

function updateTable() {
    let table = $('#cache').DataTable();
    const filter = document.getElementById('table-filter');
    let filteredData = currentSpecs.filter((d) => {
        for (const column in badgeFilters) {
            const labels = badgeFilters[column]
            for (let i = 0; i < labels.length; i++) {
                const value = labels[i];
                const pluralColumn = pluralColumns[column] || column
                if (d[pluralColumn] && !JSON.stringify(d[pluralColumn]).includes(value)) {
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
    table.clear().rows.add(filteredData).search(filter.value).draw();
    var count = table.rows({ search: 'applied' }).count();
    const resultSummary = document.getElementById('result-summary');
    resultSummary.innerHTML = `Showing ${count} of ${currentSpecs.length} Results`;
}

// Ready
$(document).ready(async function () {
    basePath = document.getElementById('base-path').innerHTML;
    packageData = JSON.parse(document.getElementById('package-data').innerHTML);
    specData = JSON.parse(document.getElementById('spec-data').innerHTML);
    applyRoute(window.location.search);
    window.navigation.addEventListener("navigate", (e) => {
        const dest = e.destination.url;
        applyRoute(dest.includes('?') ? dest.split('?')[1] : '')
    });

    // Construct tree data from package data
    treeData = [];
    for (const packageName in packageData) {
        const package = packageData[packageName]
        for (const [tagName, stackName] of package.tags.flatMap((t) => package.stacks.map((s) => [t, s]))) {
            treeData.push({ name: packageName, tag: tagName, stack: stackName })
        }
    }

    loadTree('Stack -> Tag')
    setupSidebarResize()
})
