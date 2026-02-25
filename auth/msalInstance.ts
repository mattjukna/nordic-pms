import { PublicClientApplication } from '@azure/msal-browser';
import buildMsalConfig from './msalConfig';

let singleton: PublicClientApplication | null = null;

export async function getMsalInstance(): Promise<PublicClientApplication> {
	if (singleton) return singleton;
	const built = await buildMsalConfig();
	singleton = new PublicClientApplication(built.msalConfig as any);
	return singleton;
}

export default getMsalInstance;
