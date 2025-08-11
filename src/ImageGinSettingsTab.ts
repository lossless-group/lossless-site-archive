import { App, PluginSettingTab, Setting } from 'obsidian';
import type { ImageGinPlugin } from '../types';
import { DEFAULT_IMAGE_SIZES } from './settings';

export class ImageGinSettingTab extends PluginSettingTab {
    plugin: ImageGinPlugin;

    constructor(app: App, plugin: ImageGinPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Image Gin Settings' });

        // API Key Setting
        new Setting(containerEl)
            .setName('Recraft API Key')
            .setDesc('Your Recraft API key for image generation')
            .addText(text => {
                text
                    .setPlaceholder('Enter your Recraft API key')
                    .setValue(this.plugin.settings.recraftApiKey)
                    .onChange(async (value: string) => {
                        this.plugin.settings.recraftApiKey = value;
                        this.plugin.saveData(this.plugin.settings);
                    });
                // Mask the API key input
                text.inputEl.type = 'password';
            });

        // Image Prompt Key Setting
        new Setting(containerEl)
            .setName('Image Prompt Key')
            .setDesc('Frontmatter key used to store image generation prompts')
            .addText(text => {
                text
                    .setPlaceholder('image_prompt')
                    .setValue(this.plugin.settings.imagePromptKey)
                    .onChange(async (value: string) => {
                        this.plugin.settings.imagePromptKey = value || 'image_prompt';
                        this.plugin.saveData(this.plugin.settings);
                    });
            });
    }
}
