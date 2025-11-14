import { Notice, App, Plugin } from 'obsidian';
import { OAuth2Client } from 'google-auth-library';

interface AuthTokens {
    access_token: string;
    refresh_token?: string;
    expiry_date?: number;
    token_type?: string;
    scope?: string;
}

export class GoogleAuth {
    private client: OAuth2Client;
    private tokenKey = 'google-docs-token';
    private plugin: Plugin;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            'http://localhost:3000/oauth2callback'
        );
    }

    public async getAuthClient(): Promise<OAuth2Client> {
        // Try to load token from local storage
        const token = await this.loadToken();
        if (token) {
            this.client.setCredentials(token);
            return this.client;
        }
        
        // If no token, start the OAuth flow
        return this.startOAuthFlow();
    }

    private async loadToken(): Promise<AuthTokens | null> {
        try {
            const token = await this.plugin.loadData(this.tokenKey);
            return token || null;
        } catch (error) {
            console.error('Error loading token:', error);
            return null;
        }
    }

    private async saveToken(token: AuthTokens): Promise<void> {
        try {
            await this.plugin.saveData(this.tokenKey, token);
        } catch (error) {
            console.error('Error saving token:', error);
            throw error;
        }
    }

    private async startOAuthFlow(): Promise<OAuth2Client> {
        const authUrl = this.client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/documents.readonly'],
            prompt: 'consent'
        });

        // Open the authorization URL in the default browser
        const { shell } = require('electron');
        await shell.openExternal(authUrl);

        // In a real implementation, you would set up a local server to handle the OAuth callback
        // For now, we'll use a simple prompt to get the authorization code
        const code = await new Promise<string>((resolve) => {
            const modal = new (class extends this.plugin.app.workspace.activeLeaf.view.constructor {
                private code: string = '';
                
                onOpen() {
                    this.contentEl.createEl('h2', { text: 'Google OAuth' });
                    this.contentEl.createEl('p', { 
                        text: 'Please authorize the app and enter the code from the browser window.' 
                    });
                    
                    const input = this.contentEl.createEl('input', {
                        type: 'text',
                        placeholder: 'Enter authorization code'
                    });
                    
                    const button = this.contentEl.createEl('button', {
                        text: 'Submit',
                        cls: 'mod-cta'
                    });
                    
                    button.addEventListener('click', () => {
                        this.code = input.value.trim();
                        if (this.code) {
                            resolve(this.code);
                            this.close();
                        }
                    });
                }
            })(this.app);
            
            modal.open();
        });

        try {
            const { tokens } = await this.client.getToken(code);
            await this.saveToken(tokens);
            this.client.setCredentials(tokens);
            return this.client;
        } catch (error) {
            console.error('Error getting tokens:', error);
            new Notice('Failed to authenticate with Google. Please try again.');
            throw error;
        }
    }
}
