package com.questionbank;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.Toast;

public class ImportActivity extends MainActivity {
    private static final int IMPORT_REQUEST = 1043;

    private ValueCallback<Uri[]> pending;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView.getSettings().setAllowContentAccess(true);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (pending != null) {
                    pending.onReceiveValue(null);
                }
                pending = filePathCallback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*");
                try {
                    startActivityForResult(intent, IMPORT_REQUEST);
                } catch (ActivityNotFoundException error) {
                    pending.onReceiveValue(null);
                    pending = null;
                    Toast.makeText(ImportActivity.this, "没有可用的文件选择器", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != IMPORT_REQUEST) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (pending == null) {
            return;
        }
        ValueCallback<Uri[]> callback = pending;
        pending = null;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            result = new Uri[]{data.getData()};
        }
        callback.onReceiveValue(result);
    }

    @Override
    protected void onDestroy() {
        if (pending != null) {
            pending.onReceiveValue(null);
            pending = null;
        }
        super.onDestroy();
    }
}
