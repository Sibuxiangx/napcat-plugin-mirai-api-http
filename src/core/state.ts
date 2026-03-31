import fs from 'fs';
import path from 'path';
import type { NapCatPluginContext, PluginLogger } from 'napcat-types/napcat-onebot/network/plugin/types';
import { DEFAULT_CONFIG, sanitizeConfig } from '../config';
import type { PluginConfig } from '../types';

class PluginState {
    private _ctx: NapCatPluginContext | null = null;
    config: PluginConfig = { ...DEFAULT_CONFIG };
    selfId: number = 0;

    get ctx(): NapCatPluginContext {
        if (!this._ctx) throw new Error('PluginState not initialized');
        return this._ctx;
    }

    get logger(): PluginLogger {
        return this.ctx.logger;
    }

    init(ctx: NapCatPluginContext): void {
        this._ctx = ctx;
        this.loadConfig();
        this.fetchSelfId();
    }

    private async fetchSelfId(): Promise<void> {
        try {
            const res = await this.ctx.actions.call(
                'get_login_info', {}, this.ctx.adapterName, this.ctx.pluginManager.config
            ) as { user_id?: number | string };
            if (res?.user_id) {
                this.selfId = Number(res.user_id);
                this.logger.debug(`Bot QQ: ${this.selfId}`);
            }
        } catch (e) {
            this.logger.warn('Failed to get bot QQ:', e);
        }
    }

    cleanup(): void {
        this.saveConfig();
        this._ctx = null;
    }

    loadConfig(): void {
        const configPath = this.ctx.configPath;
        try {
            if (configPath && fs.existsSync(configPath)) {
                const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                this.config = sanitizeConfig(raw);
                this.ctx.logger.debug('Config loaded');
            } else {
                this.config = { ...DEFAULT_CONFIG };
                this.saveConfig();
                this.ctx.logger.debug('Default config created');
            }
        } catch (error) {
            this.ctx.logger.error('Failed to load config, using defaults:', error);
            this.config = { ...DEFAULT_CONFIG };
        }
    }

    saveConfig(): void {
        if (!this._ctx) return;
        try {
            const configDir = path.dirname(this._ctx.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            fs.writeFileSync(this._ctx.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
        } catch (error) {
            this._ctx.logger.error('Failed to save config:', error);
        }
    }

    updateConfig(partial: Partial<PluginConfig>): void {
        this.config = sanitizeConfig({ ...this.config, ...partial });
        this.saveConfig();
    }

    replaceConfig(config: PluginConfig): void {
        this.config = sanitizeConfig(config);
        this.saveConfig();
    }

    async callAction(action: string, params: unknown = {}): Promise<unknown> {
        return this.ctx.actions.call(action, params, this.ctx.adapterName, this.ctx.pluginManager.config);
    }
}

export const pluginState = new PluginState();
