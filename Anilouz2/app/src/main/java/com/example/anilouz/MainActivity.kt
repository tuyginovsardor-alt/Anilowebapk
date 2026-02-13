
package com.example.anilouz

import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.example.anilouz.ui.theme.AniloUzTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AniloUzTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var useDesktopMode by remember { mutableStateOf(false) }
                    var showSettings by remember { mutableStateOf(false) }

                    Box(modifier = Modifier.fillMaxSize()) {
                        AniloUzWebView(useDesktopMode)

                        IconButton(
                            onClick = { showSettings = !showSettings },
                            modifier = Modifier.align(Alignment.TopEnd).padding(16.dp)
                        ) {
                            Icon(Icons.Default.Settings, contentDescription = "Settings")
                        }

                        if (showSettings) {
                            SettingsDialog(
                                useDesktopMode = useDesktopMode,
                                onDesktopModeChanged = { useDesktopMode = it },
                                modifier = Modifier.align(Alignment.TopEnd).padding(top = 64.dp, end = 16.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AniloUzWebView(useDesktopMode: Boolean) {
    AndroidView(factory = { context ->
        WebView(context).apply {
            webViewClient = WebViewClient()
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // Sayt to'g'ri ishlashi uchun
            loadUrl("https://www.anilo.uz")
        }
    }, update = { webView ->
        if (useDesktopMode) {
            webView.settings.userAgentString = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
            webView.settings.useWideViewPort = true
            webView.settings.loadWithOverviewMode = true
            webView.settings.setSupportZoom(true)
            webView.settings.builtInZoomControls = true
            webView.settings.displayZoomControls = false

        } else {
            webView.settings.userAgentString = null // Use default
            webView.settings.useWideViewPort = false
            webView.settings.loadWithOverviewMode = false

        }
        webView.reload()
    })
}

@Composable
fun SettingsDialog(
    useDesktopMode: Boolean,
    onDesktopModeChanged: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shadowElevation = 8.dp
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = useDesktopMode,
                    onCheckedChange = onDesktopModeChanged
                )
                Text("Desktop Mode")
            }
        }
    }
}
