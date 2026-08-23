package com.slavevpn.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.slavevpn.plugin.SlaveVpnPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Must run before any plugin method can touch go.Seq / clashbox.aar.
        go.LoadJNI.setContext(getApplicationContext());
        registerPlugin(SlaveVpnPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
