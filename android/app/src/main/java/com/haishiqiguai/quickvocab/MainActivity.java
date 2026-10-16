package com.haishiqiguai.quickvocab;

import android.os.Bundle;

import com.haishiqiguai.quickvocab.playback.NativePlaybackPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePlaybackPlugin.class);
        registerPlugin(ScreenAwakePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
