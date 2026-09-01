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

function createDepNode(dep, flat = false, isHidden = undefined, depth = 1) {
    if (!dep.hash) return;
    const spec = specData[dep.hash];
    if (!spec) return;
    const isBuild = dep.parameters.deptypes.length === 1 && dep.parameters.deptypes[0] === 'build';
    const li = $('<li>', { 'class': isBuild ? (isHidden ? 'hidden build-dep' : 'build-dep') : '' });
    const title = $('<div>', { 'class': 'group flex items-center justify-between gap-1 rounded px-1 py-0.5 hover:bg-accent/40' })
    const titleLeft = $('<div>', { 'class': 'group flex items-center' });
    const titleRight = $('<div>');
    const hashLabel = $('<span>', { 
        'class': 'truncate px-3 text-muted-foreground font-mono', 
        text: dep.hash.slice(0, shortHashLength),
        css: {'margin-right': depth * 12 + 'px'}
    });
    const titleLabel = $('<span>', { 'class': 'truncate font-mono', text: dep.name + '@' + spec.version });
    const openButton = $('<a>', {
        target: '_blank',
        href: '/?package=' + dep.name + '&hash=' + dep.hash,
        click: (e) => e.stopPropagation(),
    }).append(
        $('.lucide-open').first().clone()
    );
    const depTypeChips = $('<div>', { 'class': 'flex gap-1', css: {'min-width': '60px'} });
    for (depType of dep.parameters.deptypes) {
        depTypeChips.append($('<div>', { 'class': 'inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs uppercase', text: depType[0] }));
    }
    titleRight.append(openButton);
    title.append(titleLeft).append(titleRight);

    if (!flat && spec.dependencies.length) {
        titleLeft.append(depTypeChips).append(hashLabel).append($('.lucide-chevron-right').first().clone()).append(titleLabel);
        li.append(title);
        const subdepGroup = $('<ul>', { 'class': 'collapsed spec-y-0.5'});
        li.append(subdepGroup);
        title.on('click', () => {
            if (!subdepGroup.children().length) {
                const subIsHidden = $('#hide-build-control').find('input').prop('checked');
                for (const subdep of spec.dependencies.toSorted((a, b) => a.name.localeCompare(b.name))) {
                    const subdepNode = createDepNode(subdep, false, subIsHidden, depth + 1);
                    if (subdepNode) subdepGroup.append(subdepNode);
                }
            }
            subdepGroup.toggleClass('collapsed', !toggleChevron(title));
        })
    } else {
        const dotIcon = $('.lucide-dot').first().clone();
        titleLeft.append(depTypeChips).append(hashLabel).append(dotIcon).append(titleLabel);
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
    const controlCheck = $('<input>', { type: 'checkbox' });
    controlCheck.on('change', () => {
        callback($(controlCheck).prop('checked'));
    });
    return $('<label>', { id, 'class': 'flex cursor-pointer items-center gap-2 text-xs text-muted-foreground py-2' }).append(
        $('<label>', { 'class': 'switch' }).append(controlCheck).append(
            $('<span>', { 'class': 'slider' })
        )
    ).append(
        $('<span>', { text: label })
    );
}

function populateDepTreeDialog(spec, deps) {
    const dialog = $('#deptree-dialog');
    const tree = $('#deptree').empty();
    const mainTree = $('<div>');
    const flatTree = $('<div>', { 'class': 'hidden' });
    const treeControls = $('<div>', { 'class': 'flex items-center justify-between' });
    treeControls.append(createToggleControl('hide-build-control', 'Only Run/Link Deps', (checked) => {
        const buildDepNodes = $(dialog).find('.build-dep');
        buildDepNodes.each((i, item) => $(item).toggleClass('hidden', checked));
    }));
    treeControls.append(createToggleControl('flatten-control', 'Flatten & Deduplicate', (checked) => {
        mainTree.toggleClass('hidden', checked);
        flatTree.toggleClass('hidden', !checked);
    }));
    tree.append(treeControls);

    const isHidden = $('#hide-build-control').find('input').prop('checked');
    $(dialog).find('#curr-spec-version').html(spec.version);
    $(dialog).find('#num-direct-deps').html(deps.length);
    for (const dep of deps.toSorted((a, b) => a.name.localeCompare(b.name))) {
        const depNode = createDepNode(dep, false, isHidden);
        if (depNode) $(mainTree).append(depNode);
    }
    const flattened = flattenDepTree(deps, {});
    dialog.find('#num-unique-transitive-deps').html(Object.keys(flattened).length);
    for (const dep of Object.values(flattened)) {
        const flatDepNode = createDepNode(dep, flat = true, isHidden);
        if (flatDepNode) $(flatTree).append(flatDepNode);
    }
    tree.append(mainTree, flatTree);
}

function createDepTreeDialogButton(spec, deps) {
    if (!deps.length) return $('<span>', { text: noDiffMessage });
    return $('<button>', {
        'class': 'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
        click: () => {
            populateDepTreeDialog(spec, deps);
            toggleDepTreeDialogShown();
        },
    }).append(
        $('.lucide-git-branch').first().clone()
    ).append(
        $('<span>', { text: deps.length + (deps.length > 1 ? ' deps' : ' dep') })
    );
}