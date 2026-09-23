package com.slavevpn.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.slavevpn.plugin.SlaveVpnPlugin;
import com.slavevpn.plugin.SlaveVpnService;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Must run before any plugin method can touch go.Seq / clashbox.aar.
        go.LoadJNI.setContext(getApplicationContext());
        registerPlugin(SlaveVpnPlugin.class);
        super.onCreate(savedInstanceState);
        // If the process died while VPN was expected to remain active, OEMs may
        // delay the sticky-service restart. A visible cold launch is a safe,
        // foreground opportunity to restore the cached tunnel immediately.
        SlaveVpnService.recoverIfExpected(getApplicationContext());
    }
}
