import { App, CachedMetadata, Editor, HeadingCache, MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';


interface FloatingToCSettings {
	opened: boolean;
	position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

const DEFAULT_SETTINGS: FloatingToCSettings = {
	opened: true,
	position: 'top-right'
}

export default class FloatingToC extends Plugin {
	settings: FloatingToCSettings;
	currentMarkdownView: MarkdownView;
	currentContainer: HTMLElement;
	currentToC: HTMLElement;

	async onload() {
		await this.loadSettings();

		const updateToC = () => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

			if (!activeView?.file)
				return;

			this.removeExistingFloatingToC();

			this.currentContainer = activeView.containerEl;
			this.currentMarkdownView = activeView;

			const cachedMetadata: CachedMetadata | null = this.app.metadataCache.getFileCache(activeView.file);

			if (!cachedMetadata || !cachedMetadata.headings)
				return;

			this.currentToC = this.createFloatingToC();
			this.addInternalLinks(cachedMetadata.headings);
			this.setPosition(this.settings.position);
		}

		this.registerDomEvent(document, 'click', updateToC);
		this.registerEvent(this.app.workspace.on('active-leaf-change', updateToC));
		this.addSettingTab(new FloatingToCSettingTab(this.app, this));
	}

	onunload() {
		this.removeExistingFloatingToC();
	}

	openToC() {
		this.settings.opened = true;
	}

	closeToC() {
		this.settings.opened = false;
	}

	createFloatingToC() {
		const floatingToC = document.createElement('div');
		floatingToC.addClass('toc-box');

		const title = document.createElement('p');
		title.addEventListener('click', () => {
			if (this.settings.opened)
				this.closeToC();
			else
				this.openToC();
		});
		floatingToC.appendChild(title);

		const titleIcon = document.createElement('span');
		titleIcon.addClass('toc-icon');
		titleIcon.textContent = '📚';
		title.appendChild(titleIcon);

		const titleText = document.createElement('span');
		titleText.addClass('toc-title');
		titleText.textContent = 'Table of Contents';
		title.appendChild(titleText);

		const content = document.createElement('div');
		content.addClass('toc-content');
		floatingToC.appendChild(content);

		const topText = document.createElement('p');
		topText.addClass('toc-link');
		topText.addClass('toc-link-left-h1');
		content.appendChild(topText);

		const topTextLink = document.createElement('a');
		topTextLink.href = '#';
		topTextLink.textContent = '(Top)';
		topTextLink.addEventListener('click', (event) => {
			event.preventDefault();

			this.currentMarkdownView.previewMode.applyScroll(0);
			this.currentMarkdownView.editor.scrollTo(0);
		});
		topText.appendChild(topTextLink);


		if (this.settings.opened) {
			titleText.removeClass('toc-closed');
			content.removeClass('toc-closed');
		} else {
			titleText.addClass('toc-closed');
			content.addClass('toc-closed');
		}

		this.currentContainer.appendChild(floatingToC);
		return floatingToC;
	}

	removeExistingFloatingToC() {
		if (this.currentToC)
			this.currentToC.remove();
	}

	addInternalLinks(headings: HeadingCache[]) {
		headings.forEach(header => {
			this.addInternalLink(this.currentToC, header);
		});
	}

	addInternalLink(floatingToC: HTMLElement, heading: HeadingCache) {
		const p = document.createElement('p');
		p.addClass('toc-link');
		p.addClass(`toc-link-left-h${heading.level}`);

		const a = document.createElement('a');
		a.href = '#';
		a.textContent = heading.heading;
		a.addEventListener('click', async (event) => {
			event.preventDefault();
			if (this.currentMarkdownView.getMode() === 'source') {
				this.currentMarkdownView.editor.setCursor(heading.position.start.line, heading.position.start.col);
				this.currentContainer
					.findAll(`.cm-header-${heading.level}`)
					.forEach((header) => {
						if (header.textContent !== heading.heading)
							return;

						header.scrollIntoView({ behavior: 'instant' });

						if (header.parentElement) {
							header.parentElement.addClass('is-flashing');
							setTimeout(() => header.parentElement?.removeClass('is-flashing'), 2000);
						}
					});
			} else {
				this.currentMarkdownView.previewMode.applyScroll(heading.position.start.line);

				const header = this.currentContainer.find(`h${heading.level}[data-heading="${heading.heading}"]`);
				header.scrollIntoView({ behavior: 'instant' });

				if (header.parentElement) {
					header.parentElement.addClass('is-flashing');
					setTimeout(() => header.parentElement?.removeClass('is-flashing'), 2000);
				}

			}
		});

		p.appendChild(a);
		floatingToC.find('.toc-content').appendChild(p);
	}

	setPosition(position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') {
		const isHeaderVisible = this.currentContainer.find('.view-header').getCssPropertyValue('display') !== 'none';

		switch (position) {
			case 'top-left':
				this.currentToC.addClass('toc-box-top-no-header')
				this.currentToC.addClass('toc-box-left');
				break;
			case 'top-right':
				this.currentToC.addClass('toc-box-top-no-header')
				this.currentToC.addClass('toc-box-right');
				break;
			case 'bottom-left':
				this.currentToC.addClass('toc-box-bottom-no-status-bar');
				this.currentToC.addClass('toc-box-left');
				break;
			case 'bottom-right':
				this.currentToC.addClass('toc-box-bottom-no-status-bar');
				this.currentToC.addClass('toc-box-right');
				break;
		}

		if (isHeaderVisible && (position === 'top-left' || position === 'top-right')) {
			this.currentToC.removeClass('toc-box-top-no-header');
			this.currentToC.addClass('toc-box-top-header')
		}

		if (this.isBehindStatusBar()) {
			this.currentToC.removeClass('toc-box-bottom-no-status-bar');
			this.currentToC.addClass('toc-box-bottom-status-bar');
		}
	}

	isBehindStatusBar() {
		const statusBar = document.querySelector('.status-bar') as HTMLElement;
		const statusBarDOMRect = statusBar.getBoundingClientRect();
		const floatingToCDOMRect = this.currentToC.getBoundingClientRect();

		return floatingToCDOMRect.bottom >= statusBarDOMRect.top
			&& floatingToCDOMRect.right >= statusBarDOMRect.left;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class FloatingToCSettingTab extends PluginSettingTab {
	plugin: FloatingToC;

	constructor(app: App, plugin: FloatingToC) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Open')
			.setDesc('Expand the plugin')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.opened)
				.onChange(async (value) => {
					this.plugin.settings.opened = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Position')
			.setDesc('Set the position of the table of contents')
			.addDropdown(dropdown => dropdown
				.addOption('top-left', 'Top Left')
				.addOption('top-right', 'Top Right')
				.addOption('bottom-left', 'Bottom Left')
				.addOption('bottom-right', 'Bottom Right')
				.setValue(this.plugin.settings.position)
				.onChange(async (value: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
					this.plugin.settings.position = value;
					await this.plugin.saveSettings();
				}));
	}
}
