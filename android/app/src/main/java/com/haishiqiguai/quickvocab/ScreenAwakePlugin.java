package com.haishiqiguai.quickvocab;

import android.app.Activity;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenAwake")
public class ScreenAwakePlugin extends Plugin {
    @PluginMethod
    public void keepAwake(PluginCall call) {
        updateFlag(call, true);
    }

    @PluginMethod
    public void allowSleep(PluginCall call) {
        updateFlag(call, false);
    }

    private void updateFlag(PluginCall call, boolean keepAwake) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Android Activity 暂不可用");
            return;
        }
        activity.runOnUiThread(() -> {
            if (keepAwake) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            call.resolve();
        });
    }
}
