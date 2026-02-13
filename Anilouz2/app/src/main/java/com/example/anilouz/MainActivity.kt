
package com.example.anilouz

import android.os.Bundle
import android.webkit.WebChromeClient
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
                            Icon(Icons.Default.Settings, contentDescription = "Settings", tint = MaterialTheme.colorScheme.primary)
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
    // Desktop mode o'zgarganini eslab qolish uchun
    val lastDesktopMode = remember { mutableStateOf(useDesktopMode) }

    AndroidView(factory = { context ->
        WebView(context).apply {
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient() // Muhim: Sayt elementlari yuklanishi uchun
            
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                javaScriptCanOpenWindowsAutomatically = true
                loadWithOverviewMode = true
                useWideViewPort = true
                cacheMode = WebSettings.LOAD_DEFAULT
                
                // Desktop Mode uchun default sozlamalar
                if (useDesktopMode) {
                    userAgentString = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
                    setSupportZoom(true)
                    builtInZoomControls = true
                    displayZoomControls = false
                }
            }
            
            loadUrl("https://www.anilo.uz")
        }
    }, update = { webView ->
        // Faqat rejim o'zgargandagina yangilaymiz
        if (lastDesktopMode.value != useDesktopMode) {
            lastDesktopMode.value = useDesktopMode
            webView.settings.apply {
                if (useDesktopMode) {
                    userAgentString = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
                    setSupportZoom(true)
                    builtInZoomControls = true
                } else {
                    userAgentString = null // Default mobile
                    setSupportZoom(false)
                    builtInZoomControls = false
                }
            }
            webView.reload()
        }
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
        shadowElevation = 8.dp,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = useDesktopMode,
                    onCheckedChange = onDesktopModeChanged
                )
                Text("Desktop Mode", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
