// ============================================================================
// proxy.pac - Proxy Auto-Configuration
// ============================================================================
//
// 日期：2026-03-31
// 用途：企業環境中，將 Azure Private Link 及內部流量繞過 Forward Proxy，
//       確保 Private Endpoint 的 DNS 解析在本地完成並取得私有 IP。
//
// 涵蓋範圍：Azure Commercial (Public Cloud) Private Link DNS Zones
// 參考文件：https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-dns
//
// 處理流程：
//   1. host 正規化（小寫）
//   2. 非 FQDN（無句點主機名）→ DIRECT
//   3. 特定域名後綴（.tw）→ DIRECT
//   4. Azure Private Link DNS Zone（Hash Table 查表）→ DIRECT
//   5. RFC 1918 私有網段 10.0.0.0/8（dnsResolve）→ DIRECT
//   6. 其餘 → Forward Proxy
//
// 效能設計：
//   - Hash Table 後綴查表取代逐條 shExpMatch，複雜度由 O(n) 降至 O(1)
//   - Hash Table 內條目順序不影響查找速度（屬性查找與定義順序無關）
//   - dnsResolve() 置於最末，僅對未匹配規則的請求觸發阻塞式 DNS 解析
//
// 維護方式：
//   - 新增 Private Link Zone：在 AZURE_PL_ZONES 對應分類加入 ".suffix": 1
//   - 啟用 IoT / Media Zone：取消對應區塊的註解
//   - 修改後務必測試，避免影響企業網路存取
//
// ============================================================================

// ---------------------------------------------------------------------------
// Azure Private Link DNS Zone 查找表
// ---------------------------------------------------------------------------
// 格式：".zone.suffix": 1（以 "." 開頭的域名後綴，值固定為 1）
// 比對邏輯：將 host 從左至右逐層取後綴，命中即返回 DIRECT
// 排列順序：依企業環境常見使用頻率由高至低，方便維護與閱讀
// ---------------------------------------------------------------------------

var defined_AZURE_PL = false;
var AZURE_PL_ZONES;

function initAzurePLZones() {
    if (defined_AZURE_PL) return;
    defined_AZURE_PL = true;
    AZURE_PL_ZONES = {

        // -- Storage（幾乎所有 Azure 部署皆會使用）--
        ".blob.core.windows.net": 1,       // Blob
        ".file.core.windows.net": 1,       // File
        ".dfs.core.windows.net": 1,        // Data Lake Gen2
        ".queue.core.windows.net": 1,      // Queue
        ".table.core.windows.net": 1,      // Table
        ".web.core.windows.net": 1,        // Static Website
        ".afs.azure.net": 1,               // File Sync

        // -- Web（App Service / Functions 為最普遍的託管服務）--
        ".azurewebsites.net": 1,           // App Service / Functions
        ".scm.azurewebsites.net": 1,       // App Service (SCM/Kudu)
        ".azurestaticapps.net": 1,         // Static Web Apps
        ".search.windows.net": 1,          // AI Search
        ".service.signalr.net": 1,         // SignalR
        ".webpubsub.azure.com": 1,         // Web PubSub

        // -- Security（Key Vault 為安全基礎設施核心）--
        ".vaultcore.azure.net": 1,         // Key Vault
        ".azconfig.io": 1,                 // App Configuration
        ".managedhsm.azure.net": 1,        // Managed HSM
        ".attest.azure.net": 1,            // Attestation

        // -- Databases（SQL / Cosmos DB / Redis 為最常見資料層）--
        ".database.windows.net": 1,            // SQL Database
        ".documents.azure.com": 1,             // Cosmos DB (SQL)
        ".redis.cache.windows.net": 1,         // Redis Cache
        ".redis.azure.net": 1,                 // Redis Cache (新)
        ".redisenterprise.cache.azure.net": 1, // Redis Enterprise
        ".postgres.database.azure.com": 1,     // PostgreSQL
        ".mysql.database.azure.com": 1,        // MySQL
        ".mongo.cosmos.azure.com": 1,          // Cosmos DB (MongoDB)
        ".mongocluster.cosmos.azure.com": 1,   // Cosmos DB (MongoDB vCore)
        ".table.cosmos.azure.com": 1,          // Cosmos DB (Table)
        ".cassandra.cosmos.azure.com": 1,      // Cosmos DB (Cassandra)
        ".gremlin.cosmos.azure.com": 1,        // Cosmos DB (Gremlin)
        ".postgres.cosmos.azure.com": 1,       // Cosmos DB (PostgreSQL vCore)
        ".analytics.cosmos.azure.com": 1,      // Cosmos DB (Analytical)
        ".mariadb.database.azure.com": 1,      // MariaDB

        // -- Containers（容器化架構為現代部署主流）--
        ".azurecr.io": 1,                  // Container Registry (ACR)
        ".azmk8s.io": 1,                   // AKS
        ".azurecontainerapps.io": 1,       // Container Apps

        // -- Management & Governance（營運監控必備）--
        ".monitor.azure.com": 1,                       // Azure Monitor
        ".ods.opinsights.azure.com": 1,                // Log Analytics (ODS)
        ".oms.opinsights.azure.com": 1,                // Log Analytics (OMS)
        ".prometheus.monitor.azure.com": 1,            // Managed Prometheus
        ".grafana.azure.com": 1,                       // Managed Grafana
        ".backup.windowsazure.com": 1,                 // Backup
        ".siterecovery.windowsazure.com": 1,           // Site Recovery
        ".azure-automation.net": 1,                    // Automation
        ".agentsvc.azure-automation.net": 1,           // Automation (Agent)
        ".purview.azure.com": 1,                       // Purview
        ".purview-service.microsoft.com": 1,           // Purview Service
        ".purviewstudio.azure.com": 1,                 // Purview Studio
        ".prod.migration.windowsazure.com": 1,         // Migrate

        // -- AI + Machine Learning（AI 採用率快速攀升）--
        ".openai.azure.com": 1,                // Azure OpenAI
        ".cognitiveservices.azure.com": 1,     // Cognitive Services
        ".services.ai.azure.com": 1,           // AI Services
        ".inference.ml.azure.com": 1,          // Azure ML Inference
        ".api.azureml.ms": 1,                  // Azure ML Workspace
        ".instances.azureml.ms": 1,            // Azure ML Instances
        ".notebooks.azure.net": 1,             // Azure ML Notebooks
        ".aznbcontent.net": 1,                 // Azure ML Notebooks CDN
        ".directline.botframework.com": 1,     // Bot Service (Direct Line)
        ".token.botframework.com": 1,          // Bot Service (Token)

        // -- Integration（事件驅動與 API 閘道）--
        ".servicebus.windows.net": 1,                  // Service Bus / Event Hubs
        ".eventgrid.azure.net": 1,                     // Event Grid
        ".ts.eventgrid.azure.net": 1,                  // Event Grid (Topic Spaces)
        ".azure-api.net": 1,                           // API Management
        ".azurehealthcareapis.com": 1,                 // Health Data (FHIR)
        ".dicom.azurehealthcareapis.com": 1,           // Health Data (DICOM)

        // -- Analytics（資料分析與 BI）--
        ".fabric.microsoft.com": 1,                    // Fabric
        ".azuredatabricks.net": 1,                     // Databricks
        ".datafactory.azure.net": 1,                   // Data Factory
        ".adf.azure.com": 1,                           // Data Factory Portal
        ".azuresynapse.net": 1,                        // Synapse
        ".dev.azuresynapse.net": 1,                    // Synapse (Dev)
        ".sql.azuresynapse.net": 1,                    // Synapse SQL
        ".analysis.windows.net": 1,                    // Power BI
        ".pbidedicated.windows.net": 1,                // Power BI Dedicated
        ".prod.powerquery.microsoft.com": 1,           // Power Query
        ".kusto.windows.net": 1,                       // Data Explorer (Kusto)
        ".azurehdinsight.net": 1,                      // HDInsight

        // -- Compute --
        ".wvd.microsoft.com": 1,           // Azure Virtual Desktop
        ".batch.azure.com": 1,             // Batch

        // -- Hybrid + Multicloud --
        ".his.arc.azure.com": 1,                       // Azure Arc
        ".guestconfiguration.azure.com": 1,            // Guest Configuration
        ".dp.kubernetesconfiguration.azure.com": 1,    // Kubernetes Configuration

        // -- IoT（已停用，取消註解即可啟用）--
        // ".azure-devices.net": 1,                    // IoT Hub
        // ".azure-devices-provisioning.net": 1,       // Device Provisioning
        // ".azureiotcentral.com": 1,                  // IoT Central
        // ".api.adu.microsoft.com": 1,                // Device Update
        // ".digitaltwins.azure.net": 1,               // Digital Twins

        // -- Media（已停用，取消註解即可啟用）--
        // ".media.azure.net": 1,                      // Media Services
    };
}

// ---------------------------------------------------------------------------
// 主函式
// ---------------------------------------------------------------------------

function FindProxyForURL(url, host) {

    // 1. 正規化
    var lowerHost = host.toLowerCase();

    // 2. 非 FQDN → DIRECT（無句點主機名，如 http://intranet）
    if (isPlainHostName(lowerHost)) {
        return "DIRECT";
    }

    // 3. 特定域名後綴 → DIRECT
    if (dnsDomainIs(lowerHost, ".tw")) {
        return "DIRECT";
    }

    // 4. Azure Private Link DNS Zone → DIRECT
    //    逐層取後綴比對 Hash Table，平均 4~5 次查找即可完成
    initAzurePLZones();
    var pos = lowerHost.indexOf(".");
    while (pos !== -1) {
        if (AZURE_PL_ZONES[lowerHost.substring(pos)] === 1) {
            return "DIRECT";
        }
        pos = lowerHost.indexOf(".", pos + 1);
    }

    // 5. RFC 1918 私有網段 → DIRECT
    //    dnsResolve() 為阻塞式呼叫，僅對未匹配上述規則的請求觸發
    if (isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0")) {
        return "DIRECT";
    }

    // 6. 預設 → Forward Proxy
    return "PROXY 10.0.0.5:8000";

    // 替代方案（取消註解即可切換）：
    // return "PROXY 10.0.0.5:8000; DIRECT";
    // return "PROXY 10.0.0.5:8000; PROXY 10.0.0.6:8000; DIRECT";
    // return "PROXY 10.0.0.5:8000; SOCKS5 10.0.0.7:1080; DIRECT";
}

