// src/modals/CurrentFileModal.ts

import { App, Modal, Notice, Editor, Setting } from 'obsidian';
import { ImageGinSettings, STYLE_OPTIONS } from '../settings/settings';
import type ImageGinPlugin from '../../main';
import { extractFrontmatter } from '../utils/yamlFrontmatter';

type SizeOption = {
    id: string;
    label: string;
    width: number;
    height: number;
};

export function openCurrentFileModal(
    app: App, 
    plugin: ImageGinPlugin,
    editor: Editor
) {
    return new (class CurrentFileModal extends Modal {
        private settings: ImageGinSettings;
        private imagePrompt: string = '';
        private selectedSizes = new Set<string>(['banner', 'portrait']);
        private editor: Editor;

        constructor(app: App, plugin: ImageGinPlugin, editor: Editor) {
            super(app);
            this.settings = plugin.settings;
            this.editor = editor;
            this.extractFrontmatter();
        }

        private extractFrontmatter() {
            const content = this.editor.getValue();
            const frontmatter = extractFrontmatter(content);
            this.imagePrompt = frontmatter?.image_prompt || '';
        }

        onOpen() {
            this.contentEl.empty();
            this.renderModalContent();
        }

        onClose() {
            this.contentEl.empty();
        }

        private handleGenerate = async () => {
            if (!this.imagePrompt.trim()) {
                new Notice('Please enter an image prompt');
                return;
            }

            // Close the modal on success
            this.close();
        };

            if (this.selectedSizes.size === 0) {
                new Notice('Please select at least one image size');
                return;
            }

            this.isGenerating = true;
            this.progress = 0;
            this.updateProgress();

            try {
                console.log('=== Starting Image Generation ===');
                console.log('Prompt:', this.imagePrompt);
                console.log('Selected Sizes:', Array.from(this.selectedSizes));
                console.log('Settings:', {
                    apiKey: this.settings.recraftApiKey ? '*** (set)' : 'MISSING',
                    baseUrl: this.settings.recraftBaseUrl,
                    model: this.settings.recraftModelChoice
                });

                const sizes = Array.from(this.selectedSizes);
                const totalSteps = sizes.length;
                let completed = 0;
                const imageService = new RecraftImageService(this.settings, this.app.vault);
                const activeFile = this.app.workspace.getActiveFile();
                
                if (!activeFile) {
                    throw new Error('No active file found');
                }
                
                console.log('Active File:', activeFile.path);

                // Get the base name from the current file
                const baseName = activeFile.basename;
                const styleParams = this.buildStyleParams();
                const generatedImages: { [key: string]: string } = {};
                let anyImageGenerated = false;

                console.log(`Generating ${sizes.length} image(s) with style params:`, styleParams);

                for (const sizeId of sizes) {
                    const size = this.settings.imageSizes.find(s => s.id === sizeId);
                    if (!size) {
                        console.warn(`Size with ID '${sizeId}' not found in settings`);
                        continue;
                    }

                    try {
                        console.log(`\n=== Generating ${size.width}x${size.height} image ===`);
                        
                        // Generate the image
                        console.log('Calling generateImage with:', {
                            prompt: this.imagePrompt,
                            width: size.width,
                            height: size.height,
                            styleParams
                        });

                        const image = await imageService.generateImage(
                            this.imagePrompt,
                            size.width,
                            size.height,
                            styleParams
                        );

                        console.log('Image generation response:', {
                            hasImage: !!image,
                            hasBase64: !!(image?.base64),
                            timestamp: image?.timestamp
                        });

                        if (!image?.base64) {
                            throw new Error('No image data received from API');
                        }

                        console.log(`\n=== Saving ${size.width}x${size.height} image ===`);
                        
                        // Save the image
                        const imagePath = imageService.getImagePath(
                            baseName,
                            size.width,
                            size.height,
                            image.timestamp
                        );
                        
                        console.log('Saving to path:', imagePath);
                        await imageService.saveImage(image, imagePath);
                        
                        // Store the relative path to the image
                        generatedImages[size.yamlKey] = imagePath;
                        anyImageGenerated = true;
                        
                        console.log(`✅ Successfully saved image to: ${imagePath}`);
                        
                    } catch (error: unknown) {
                        console.error('=== ERROR DETAILS ===');
                        console.error('Error type:', error && typeof error === 'object' && 'constructor' in error ? error.constructor?.name : typeof error);
                        
                        const errorMessage = error instanceof Error ? error.message : 
                                          (error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error');
                        const errorStack = error instanceof Error ? error.stack : undefined;
                        
                        console.error('Error message:', errorMessage);
                        if (errorStack) {
                            console.error('Error stack:', errorStack);
                        }
                        
                        console.error(`Error generating ${size?.width}x${size?.height} image:`, error);
                        
                        new Notice(
                            `Error generating ${size?.width}x${size?.height} image: ${errorMessage}`,
                            10000 // Show for 10 seconds
                        );
                        
                        // Continue with other sizes even if one fails
                    } finally {
                        // Update progress even if there was an error
                        completed++;
                        this.progress = Math.min(100, Math.round((completed / totalSteps) * 100));
                        this.updateProgress();
                    }
                }

                // Update frontmatter with the generated image paths
                if (Object.keys(generatedImages).length > 0) {
                    console.log('Updating frontmatter with generated images:', generatedImages);
                    for (const [key, path] of Object.entries(generatedImages)) {
                        this.updateFrontmatter(key, path);
                    }
                    new Notice(`Successfully generated ${Object.keys(generatedImages).length} image(s)!`);
                } else if (!anyImageGenerated) {
                    const errorMsg = 'Failed to generate any images. Check console for details.';
                    console.error(errorMsg);
                    throw new Error(errorMsg);
                }

            } catch (error) {
                console.error('Error in generateImages:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                new Notice(`Error: ${errorMessage}`);
            } finally {
                this.isGenerating = false;
                this.updateProgress();
            }
        }

        private buildStyleParams() {
            if (this.settings.style.useCustomStyle && this.settings.style.customStyleId) {
                return { style_id: this.settings.style.customStyleId };
            } else {
                const params: any = { 
                    style: this.settings.style.presetStyle.base 
                };
                if (this.settings.style.presetStyle.substyle) {
                    params.substyle = this.settings.style.presetStyle.substyle;
                }
                return params;
            }
        }

        private updateProgress() {
            const progressEl = this.contentEl.querySelector<HTMLElement>('.progress-text');
            if (progressEl) {
                this.updateProgressText(progressEl);
            }
        }

        private updateProgressText(progressEl: HTMLElement) {
            if (this.isGenerating) {
                progressEl.textContent = `Generating images... ${Math.round(this.progress)}%`;
                progressEl.classList.add('mod-warning');
            } else {
                progressEl.textContent = '';
                progressEl.classList.remove('mod-warning');
            }
        }

        private async updateFrontmatter(key: string, value: string) {
            try {
                // Update the frontmatter object
                const updatedFrontmatter = { ...this.frontmatter, [key]: value };
                
                // Get the current content
                const content = this.editor.getValue();
                
                // Format the updated frontmatter using the utility function
                const formattedFrontmatter = formatFrontmatter(updatedFrontmatter);
                
                // Check if frontmatter exists
                const hasFrontmatter = content.startsWith('---\n');
                let updatedContent: string;
                
                if (hasFrontmatter) {
                    // Replace existing frontmatter
                    const frontmatterEnd = content.indexOf('\n---', 3);
                    if (frontmatterEnd !== -1) {
                        const afterFrontmatter = content.substring(frontmatterEnd);
                        updatedContent = `---\n${formattedFrontmatter}${afterFrontmatter}`;
                    } else {
                        // Malformed frontmatter, append to the beginning
                        updatedContent = `---\n${formattedFrontmatter}\n---\n\n${content}`;
                    }
                } else {
                    // Add new frontmatter
                    updatedContent = `---\n${formattedFrontmatter}\n---\n\n${content}`;
                }
                
                // Update the editor content
                this.editor.setValue(updatedContent);
                
                // Update the local frontmatter object
                this.frontmatter = updatedFrontmatter;
                
                console.log(`Updated frontmatter with ${key}: ${value}`);
                
            } catch (error) {
                console.error('Error updating frontmatter:', error);
                throw new Error(`Failed to update frontmatter: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        private renderModalContent() {
            // Image Prompt Section
            const container = this.contentEl.createDiv('image-gin-container');
            
            // Image Prompt
            new Setting(container)
                .setName('Image Prompt')
                .setDesc('Describe the image you want to generate')
                .addTextArea(text => {
                    text
                        .setPlaceholder('A beautiful landscape with mountains and a lake')
                        .setValue(this.imagePrompt)
                        .onChange(value => this.imagePrompt = value);
                    text.inputEl.rows = 3;
                    text.inputEl.addClass('image-gin-textarea');
                });

            // Image Sizes
            const sizeSetting = new Setting(container)
                .setName('Image Sizes')
                .setDesc('Select the sizes to generate');

            const sizeContainer = sizeSetting.settingEl.createDiv('image-gin-toggle-group');
            
            this.settings.imageSizes.forEach(size => {
                const toggleItem = sizeContainer.createDiv('image-gin-toggle-item');
                
                new Setting(toggleItem)
                    .setClass('image-gin-toggle')
                    .addToggle(toggle => {
                        toggle
                            .setValue(this.selectedSizes.has(size.id))
                            .onChange(selected => {
                                selected ? this.selectedSizes.add(size.id) : this.selectedSizes.delete(size.id);
                            });
                    });
                
                toggleItem.createSpan({
                    text: `${size.label} (${size.width}×${size.height})`,
                    cls: 'image-gin-toggle-label'
                });
            });

            } else {
                const styleGroup = STYLE_OPTIONS[this.settings.style.presetStyle.base];
                if (styleGroup) {
                    const selectedStyle = styleGroup.substyles.find(
                        s => s.id === this.settings.style.presetStyle.substyle
                    );
                    
                    styleContent.createEl('p', {
                        text: `Style: ${styleGroup.label} › ${selectedStyle?.label || 'Default'}`,
                        cls: 'image-gin-description'
                    });
                }
            }

            // Progress Indicator
            const progressEl = this.contentEl.createDiv({ cls: 'image-gin-progress' });
            const progressText = progressEl.createDiv({ cls: 'image-gin-progress-text' });
            
            // Update progress text based on state
            this.updateProgressText(progressText);

            // Generate Button
            const buttonContainer = this.contentEl.createDiv({ cls: 'image-gin-button-container' });
            const generateBtn = document.createElement('button');
            generateBtn.type = 'button';
            generateBtn.className = 'image-gin-button';
            generateBtn.textContent = 'Generate Images';
            generateBtn.disabled = this.isGenerating;
            
            generateBtn.addEventListener('click', async () => {
                generateBtn.disabled = true;
                try {
                    await this.generateImages();
                } finally {
                    generateBtn.disabled = false;
                }
            });
            
            buttonContainer.appendChild(generateBtn);
        }
    })(app, plugin, editor);
}