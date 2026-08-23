package com.slavevpn.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.slavevpn.plugin.SlaveVpnPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SlaveVpnPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
