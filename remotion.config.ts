import { Config } from '@remotion/cli/config';

// Increase timeout for asset loading to 5 minutes (default is 30s)
// This prevents "delayRender() ... was called but not cleared" errors
Config.setDelayRenderTimeoutInMilliseconds(300000); 
