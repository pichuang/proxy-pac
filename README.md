# Proxy Auto-Configuration (PAC)

企業環境中，用於將 Azure Private Link、內部網段及特定域名流量繞過 Forward Proxy 的 PAC (Proxy Auto-Configuration) 檔案。

## 問題背景

當企業網路部署了 Forward Proxy（如 Squid、Zscaler、BlueCoat 等），所有對外流量預設都會經由 Proxy 轉發。然而，Azure Private Link / Private Endpoint 的運作原理是透過 **本地 DNS 解析** 將 Azure 服務的 FQDN 解析為 VNet 內的私有 IP。若這些流量被送往 Proxy，Proxy 會在自身的 DNS 環境中解析域名，取得的是 **公用 IP** 而非私有 IP，導致：

- Private Endpoint 連線失敗
- 流量意外走公用路徑（繞過私有連線的安全架構）
- 延遲增加且頻寬浪費

## 解決方案

透過 PAC 檔案，讓用戶端在發出 HTTP/HTTPS 請求時，依序判斷：

1. 是否為內部主機（非 FQDN）
2. 是否屬於內部網段（`10.0.0.0/8`）或特定國家域名（`*.tw`）
3. 是否屬於 Azure Private Link DNS Zone

若符合以上任何條件，則直接連線（`DIRECT`），不經過 Proxy。

## 涵蓋的 Azure 服務 DNS Zones

本 PAC 檔依據微軟官方文件整理，涵蓋 **Azure Commercial (Public Cloud)** 所有 Private Link DNS Zones：

| 編號 | 分類 | 規則數 | 涵蓋服務 |
|---|---|---|---|
| 4.01 | **Storage** | 7 | Blob、Table、Queue、File、Web、Data Lake (DFS)、File Sync |
| 4.02 | **Databases** | 15 | SQL Database、Cosmos DB (SQL/MongoDB/Cassandra/Gremlin/Table/Analytical)、PostgreSQL (Cosmos/Flexible/Single)、MySQL、MariaDB、Redis (Standard/Enterprise/Managed) |
| 4.03 | **AI + Machine Learning** | 10 | Azure ML (Workspace/Registry)、Cognitive Services、Azure OpenAI、AI Services、Bot Service |
| 4.04 | **Analytics** | 12 | Synapse Analytics、Data Factory、HDInsight、Data Explorer (Kusto)、Power BI、Databricks、Fabric |
| 4.05 | **Compute** | 2 | Batch、Virtual Desktop (AVD) |
| 4.06 | **Containers** | 3 | AKS、Container Apps、Container Registry (ACR) |
| 4.07 | **Security** | 4 | Key Vault、Managed HSM、App Configuration、Attestation |
| 4.08 | **Integration** | 6 | Service Bus、Event Hubs、Event Grid、API Management、Health Data Services |
| 4.09 | ~~**IoT**~~ | ~~5~~ | ~~IoT Hub、Device Provisioning Service、Device Update、IoT Central、Digital Twins~~（已停用） |
| 4.10 | ~~**Media**~~ | ~~1~~ | ~~Media Services~~（已停用） |
| 4.11 | **Management & Governance** | 13 | Azure Monitor、Automation、Backup、Site Recovery、Purview、Grafana、Migrate、Prometheus |
| 4.12 | **Hybrid + Multicloud** | 3 | Azure Arc、Guest Configuration、Kubernetes Configuration |
| 4.13 | **Web** | 6 | Cognitive Search、App Service / Functions、SignalR、Static Web Apps、Web PubSub |

**Azure Private Link 規則合計：81 條啟用 / 6 條停用（IoT 5 條 + Media 1 條已註解）**

## 檔案結構

```
ms-proxy/
├── proxy.pac     # PAC 主檔案
└── README.md     # 本文件
```

## PAC 邏輯流程

```
用戶端發出 HTTP/HTTPS 請求
        │
        ▼
  ┌─ 第 1 步：host 轉為小寫 ─┐
  └────────────────────────────┘
        │
        ▼
  ┌─ 第 2 步：無句點主機名？ ──┐
  │  (如 http://intranet)      │
  └────────────────────────────┘
        │是                 否│
        ▼                    ▼
     DIRECT          ┌─ 第 3 步 ─────────────┐
                     │ 3a. 10.0.0.0/8 網段？  │
                     │ 3b. *.tw 域名？        │
                     └────────────────────────┘
                           │是           否│
                           ▼              ▼
                        DIRECT    ┌─ 第 4 步 ──────────────┐
                                  │ Azure Private Link     │
                                  │ DNS Zone 比對 (87 條)  │
                                  └────────────────────────┘
                                       │是            否│
                                       ▼               ▼
                                    DIRECT      ┌─ 第 5 步 ─────────┐
                                                │ 送往企業 Proxy    │
                                                │ 10.0.0.5:8000    │
                                                └───────────────────┘
```

## 使用方式

### 1. 部署 PAC 檔案

將 `proxy.pac` 託管於內部 Web Server，確保可透過 HTTP/HTTPS 存取：

```
https://internal-server.contoso.com/proxy.pac
```

> **注意**：PAC 檔案必須以 `application/x-ns-proxy-autoconfig` MIME 類型提供。

### 2. 用戶端設定

#### Windows (群組原則 GPO)

```
User Configuration → Preferences → Windows Settings → Registry
→ HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings
   AutoConfigURL = https://internal-server.contoso.com/proxy.pac
```

#### Windows (手動)

「設定」→「網路和網際網路」→「Proxy」→「使用設定指令碼」→ 輸入 PAC 檔案 URL

#### macOS

「系統偏好設定」→「網路」→ 選擇網路介面 →「進階」→「代理伺服器」→「自動代理伺服器設定」→ 輸入 PAC 檔案 URL

#### Linux (瀏覽器)

```bash
# PAC 檔案不直接適用 Linux CLI，但瀏覽器支援
# 以 Firefox 為例：Settings → Network Settings → Automatic proxy configuration URL
```

### 3. 自訂 Proxy 位址

預設 Proxy 位址為 `10.0.0.5:8000`（強制走 Proxy，不含 Failover 直連）。可依需求修改 `proxy.pac` 第 5 步：

```javascript
// 單一 Proxy（目前預設）
return "PROXY 10.0.0.5:8000";

// Proxy + Failover 直連（Proxy 掛了自動直連）
return "PROXY 10.0.0.5:8000; DIRECT";

// 雙 Proxy + Failover 直連
return "PROXY 10.0.0.5:8000; PROXY 10.0.0.6:8000; DIRECT";

// HTTP Proxy + SOCKS5 Proxy + Failover 直連
return "PROXY 10.0.0.5:8000; SOCKS5 10.0.0.7:1080; DIRECT";
```

### 4. 自訂繞過規則

如需新增額外的繞過域名或網段，可在 `proxy.pac` 對應區段加入：

```javascript
// 第 3 步新增其他 RFC 1918 網段
if (isInNet(dnsResolve(host), "172.16.0.0", "255.240.0.0")) {
    return "DIRECT";
}
if (isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0")) {
    return "DIRECT";
}

// 第 3 步新增其他國家/公司域名
if (shExpMatch(lowerHost, "*.contoso.com")) {
    return "DIRECT";
}
```

## 本機測試

### 1. 啟動本機 HTTP Server 託管 PAC 檔案

PAC 檔案必須透過 HTTP/HTTPS 提供，不支援 `file://` 路徑。使用 Python 在本機快速啟動，並設定正確的 MIME 類型：

```bash
# 進入 proxy.pac 所在目錄
cd /path/to/proxy-pac

# 啟動 HTTP Server（port 8080），並註冊 .pac 的 MIME 類型
python3 -c "
from http.server import SimpleHTTPRequestHandler, HTTPServer
SimpleHTTPRequestHandler.extensions_map['.pac'] = 'application/x-ns-proxy-autoconfig'
HTTPServer(('0.0.0.0', 8080), SimpleHTTPRequestHandler).serve_forever()
"
```

PAC 檔案 URL 為：`http://127.0.0.1:8080/proxy.pac`

### 2. 設定系統使用本機 PAC 檔案

#### macOS（指令）

```bash
# 查看可用的網路介面名稱
networksetup -listallnetworkservices

# 開啟 - 設定自動代理伺服器 PAC URL（以 Wi-Fi 為例）
networksetup -setautoproxyurl "Wi-Fi" "http://127.0.0.1:8080/proxy.pac"

# 確認已套用
networksetup -getautoproxyurl "Wi-Fi"
```

```bash
# 關閉 - 停用自動代理伺服器設定
networksetup -setautoproxystate "Wi-Fi" off

# 確認已關閉
networksetup -getautoproxyurl "Wi-Fi"
```

> **提示**：若使用有線網路，請將 `"Wi-Fi"` 替換為 `"Ethernet"` 或對應的介面名稱。

#### Windows（指令）

```powershell
# 開啟 - 設定自動代理伺服器 PAC URL
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v AutoConfigURL /t REG_SZ /d "http://127.0.0.1:8080/proxy.pac" /f

# 確認已套用
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v AutoConfigURL
```

```powershell
# 關閉 - 移除自動代理伺服器設定
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings" /v AutoConfigURL /f
```

#### Linux（環境變數，僅適用於支援 PAC 的應用程式）

```bash
# 開啟
export http_proxy="http://127.0.0.1:8080/proxy.pac"
export https_proxy="http://127.0.0.1:8080/proxy.pac"

# 關閉
unset http_proxy
unset https_proxy
```

> **注意**：Linux CLI 工具（如 `curl`、`wget`）多數不支援 PAC 檔案解析，環境變數方式僅對部分應用有效。建議使用瀏覽器設定或搭配 `pactester` 驗證。

### 3. 使用 pactester 驗證 PAC 邏輯

[`pactester`](https://github.com/manugarg/pacparser) 可在不套用系統設定的情況下，直接測試 PAC 檔案對特定 URL 的回傳結果：

```bash
# macOS 安裝
brew install pacparser

# 測試 Azure Storage Blob（預期回傳 DIRECT）
pactester -p proxy.pac -u "https://mystorage.blob.core.windows.net/container/file"

# 測試外部網站（預期回傳 PROXY 10.0.0.5:8000）
pactester -p proxy.pac -u "https://www.google.com"

# 測試內部主機名（預期回傳 DIRECT）
pactester -p proxy.pac -u "http://intranet"

# 測試 *.tw 域名（預期回傳 DIRECT）
pactester -p proxy.pac -u "https://www.microsoft.com.tw"

# 批次測試多個 URL
cat <<EOF | while read url; do echo "$url → $(pactester -p proxy.pac -u "$url")"; done
https://mystorage.blob.core.windows.net/data
https://mydb.database.windows.net
https://myoai.openai.azure.com/v1/chat
https://www.google.com
https://internal.contoso.tw
http://intranet
EOF
```

### 4. 使用瀏覽器驗證

開啟瀏覽器並設定 PAC URL 後，可透過開發者工具（F12）的「Network」分頁觀察請求是否經由 Proxy 或直連。

### 5. 驗證 PAC 檔案 MIME 類型

PAC 檔案必須以 `application/x-ns-proxy-autoconfig` MIME 類型提供，否則部分用戶端（如 IE、Edge、macOS 系統 Proxy）會拒絕載入。啟動 HTTP Server 後，使用以下方式驗證：

```bash
# 檢查 HTTP Response Header 中的 Content-Type
curl -I http://127.0.0.1:8080/proxy.pac
```

預期輸出應包含：

```
Content-Type: application/x-ns-proxy-autoconfig
```

若顯示 `application/octet-stream` 或其他類型，表示 Web Server 未正確設定 MIME 類型，請依據所使用的伺服器進行調整：

| Web Server | 設定方式 |
|---|---|
| **Nginx** | 在 `nginx.conf` 或 `mime.types` 加入 `application/x-ns-proxy-autoconfig pac;`，或在 `location /proxy.pac` 中設定 `default_type application/x-ns-proxy-autoconfig;` |
| **Apache** | 在 `.htaccess` 或 `httpd.conf` 加入 `AddType application/x-ns-proxy-autoconfig .pac` |
| **IIS** | 在 `web.config` 的 `<staticContent>` 加入 `<mimeMap fileExtension=".pac" mimeType="application/x-ns-proxy-autoconfig" />` |
| **Azure Blob Storage** | 上傳時指定 `--content-type 'application/x-ns-proxy-autoconfig'` |

## 注意事項

- **僅涵蓋 Commercial Cloud**：Government (`*.usgovcloudapi.net`) 與 China (`*.chinacloudapi.cn`) 雲端的 DNS Zones 未包含於此版本。如有需要，請另行加入。
- **含區域變數的 DNS Zone**：如 Kusto (`{regionName}.kusto.windows.net`)、AKS (`{regionName}.azmk8s.io`) 等，已使用更廣的萬用字元 (`*.kusto.windows.net`、`*.azmk8s.io`) 涵蓋所有區域。
- **Azure Resource Manager**：`privatelink.azure.com` 因範圍過廣（會匹配所有 `*.azure.com`），未納入規則，避免誤繞過不應直連的流量。
- **定期更新**：Azure 服務持續新增，建議定期比對[官方文件](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-dns)更新此 PAC 檔。
- **預設無 Failover**：目前預設路由為 `PROXY 10.0.0.5:8000`（不含 `DIRECT`），Proxy 不可用時連線將失敗。如需 Failover 請參考上方「自訂 Proxy 位址」區段。

## 參考資料

- [Azure Private Endpoint DNS Configuration - Microsoft Learn](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-dns)
- [PAC File Specification (FindProxyForURL)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Proxy_servers_and_tunneling/Proxy_Auto-Configuration_PAC_file)
- [Web Proxy Auto-Discovery (WPAD)](https://en.wikipedia.org/wiki/Web_Proxy_Auto-Discovery_Protocol)

## 授權

此專案僅供企業內部使用參考。
