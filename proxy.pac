// ============================================================================
// proxy.pac - Proxy Auto-Configuration
// ============================================================================
// 日期：2026-03-27
// 用途：企業環境中，將 Azure Private Link 及內部流量繞過 Forward Proxy，
//       確保 Private Endpoint 的 DNS 解析在本地完成並取得私有 IP。
//
// 維護須知：
//   - 本檔僅涵蓋 Azure Commercial (Public Cloud) DNS Zones
//   - 修改後請務必測試，避免影響企業網路存取
// ============================================================================

function FindProxyForURL(url, host) {

    // ========================================================================
    // 第 1 步：正規化處理
    // ========================================================================
    // 將 host 轉為全小寫，確保後續 shExpMatch 比對時大小寫一致
    var lowerHost = host.toLowerCase();

    // ========================================================================
    // 第 2 步：內部主機 / 非 FQDN 繞過
    // ========================================================================
    // 無句點的主機名 (如 http://intranet)，視為內部資源直接繞過
    if (isPlainHostName(lowerHost)) {
        return "DIRECT";
    }

    // ========================================================================
    // 第 3 步：內部網段與特定域名繞過
    // ========================================================================

    // 3a. RFC 1918 私有網段 - 10.0.0.0/8
    if (isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0")) {
        return "DIRECT";
    }

    // 3b. 台灣國家域名 (*.tw) 直連
    if (shExpMatch(lowerHost, "*.tw")) {
        return "DIRECT";
    }

    // ========================================================================
    // 第 4 步：Azure Private Link DNS Zones 繞過
    // ========================================================================
    // 依據 https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-dns
    // 涵蓋所有 Azure Commercial (Public Cloud) Private Link DNS Zones
    // 匹配成功 → DIRECT（本地 DNS 解析取得 Private Endpoint 私有 IP）

    if (

        // ---- 4.01 Storage (7 rules) ----
        // Blob / Table / Queue / File / Static Website / Data Lake Gen2 / File Sync
        shExpMatch(lowerHost, "*.blob.core.windows.net") ||
        shExpMatch(lowerHost, "*.dfs.core.windows.net") ||
        shExpMatch(lowerHost, "*.file.core.windows.net") ||
        shExpMatch(lowerHost, "*.queue.core.windows.net") ||
        shExpMatch(lowerHost, "*.table.core.windows.net") ||
        shExpMatch(lowerHost, "*.web.core.windows.net") ||
        shExpMatch(lowerHost, "*.afs.azure.net") ||

        // ---- 4.02 Databases (15 rules) ----
        // SQL Database / Cosmos DB (SQL, MongoDB, Cassandra, Gremlin, Table, Analytical,
        // PostgreSQL vCore, MongoDB vCore) / PostgreSQL / MySQL / MariaDB / Redis
        shExpMatch(lowerHost, "*.database.windows.net") ||
        shExpMatch(lowerHost, "*.documents.azure.com") ||
        shExpMatch(lowerHost, "*.analytics.cosmos.azure.com") ||
        shExpMatch(lowerHost, "*.cassandra.cosmos.azure.com") ||
        shExpMatch(lowerHost, "*.gremlin.cosmos.azure.com") ||
        shExpMatch(lowerHost, "*.mongo.cosmos.azure.com") ||
        shExpMatch(lowerHost, "*.mongocluster.cosmos.azure.com") ||
        shExpMatch(lowerHost, "*.postgres.cosmos.azure.com") ||
        shExpMatch(lowerHost, "*.table.cosmos.azure.com") ||
        shExpMatch(lowerHost, "*.mariadb.database.azure.com") ||
        shExpMatch(lowerHost, "*.mysql.database.azure.com") ||
        shExpMatch(lowerHost, "*.postgres.database.azure.com") ||
        shExpMatch(lowerHost, "*.redis.cache.windows.net") ||
        shExpMatch(lowerHost, "*.redis.azure.net") ||
        shExpMatch(lowerHost, "*.redisenterprise.cache.azure.net") ||

        // ---- 4.03 AI + Machine Learning (10 rules) ----
        // Azure ML (Workspace, Registry) / Cognitive Services / OpenAI / AI Services / Bot Service
        shExpMatch(lowerHost, "*.api.azureml.ms") ||
        shExpMatch(lowerHost, "*.aznbcontent.net") ||
        shExpMatch(lowerHost, "*.cognitiveservices.azure.com") ||
        shExpMatch(lowerHost, "*.directline.botframework.com") ||
        shExpMatch(lowerHost, "*.inference.ml.azure.com") ||
        shExpMatch(lowerHost, "*.instances.azureml.ms") ||
        shExpMatch(lowerHost, "*.notebooks.azure.net") ||
        shExpMatch(lowerHost, "*.openai.azure.com") ||
        shExpMatch(lowerHost, "*.services.ai.azure.com") ||
        shExpMatch(lowerHost, "*.token.botframework.com") ||

        // ---- 4.04 Analytics (12 rules) ----
        // Synapse / Data Factory / HDInsight / Data Explorer (Kusto) / Power BI / Databricks / Fabric
        shExpMatch(lowerHost, "*.adf.azure.com") ||
        shExpMatch(lowerHost, "*.analysis.windows.net") ||
        shExpMatch(lowerHost, "*.azuredatabricks.net") ||
        shExpMatch(lowerHost, "*.azurehdinsight.net") ||
        shExpMatch(lowerHost, "*.azuresynapse.net") ||
        shExpMatch(lowerHost, "*.datafactory.azure.net") ||
        shExpMatch(lowerHost, "*.dev.azuresynapse.net") ||
        shExpMatch(lowerHost, "*.fabric.microsoft.com") ||
        shExpMatch(lowerHost, "*.kusto.windows.net") ||
        shExpMatch(lowerHost, "*.pbidedicated.windows.net") ||
        shExpMatch(lowerHost, "*.prod.powerquery.microsoft.com") ||
        shExpMatch(lowerHost, "*.sql.azuresynapse.net") ||

        // ---- 4.05 Compute (2 rules) ----
        // Batch / Virtual Desktop (AVD)
        shExpMatch(lowerHost, "*.batch.azure.com") ||
        shExpMatch(lowerHost, "*.wvd.microsoft.com") ||

        // ---- 4.06 Containers (3 rules) ----
        // AKS / Container Apps / Container Registry (ACR)
        shExpMatch(lowerHost, "*.azurecr.io") ||
        shExpMatch(lowerHost, "*.azurecontainerapps.io") ||
        shExpMatch(lowerHost, "*.azmk8s.io") ||

        // ---- 4.07 Security (4 rules) ----
        // Key Vault / Managed HSM / App Configuration / Attestation
        shExpMatch(lowerHost, "*.attest.azure.net") ||
        shExpMatch(lowerHost, "*.azconfig.io") ||
        shExpMatch(lowerHost, "*.managedhsm.azure.net") ||
        shExpMatch(lowerHost, "*.vaultcore.azure.net") ||

        // ---- 4.08 Integration (6 rules) ----
        // Service Bus / Event Hubs / Event Grid / API Management / Health Data Services
        shExpMatch(lowerHost, "*.azure-api.net") ||
        shExpMatch(lowerHost, "*.azurehealthcareapis.com") ||
        shExpMatch(lowerHost, "*.dicom.azurehealthcareapis.com") ||
        shExpMatch(lowerHost, "*.eventgrid.azure.net") ||
        shExpMatch(lowerHost, "*.servicebus.windows.net") ||
        shExpMatch(lowerHost, "*.ts.eventgrid.azure.net") ||

        // ---- 4.09 Internet of Things / IoT (5 rules) ----
        // IoT Hub / Device Provisioning Service / Device Update / IoT Central / Digital Twins
        // shExpMatch(lowerHost, "*.azure-devices.net") ||
        // shExpMatch(lowerHost, "*.azure-devices-provisioning.net") ||
        // shExpMatch(lowerHost, "*.azureiotcentral.com") ||
        // shExpMatch(lowerHost, "*.api.adu.microsoft.com") ||
        // shExpMatch(lowerHost, "*.digitaltwins.azure.net") ||

        // ---- 4.10 Media (1 rule) ----
        // Media Services (Key Delivery / Live Event / Streaming Endpoint)
        // shExpMatch(lowerHost, "*.media.azure.net") ||

        // ---- 4.11 Management and Governance (13 rules) ----
        // Automation / Backup / Site Recovery / Monitor / Purview / Migrate / Grafana / Prometheus
        shExpMatch(lowerHost, "*.agentsvc.azure-automation.net") ||
        shExpMatch(lowerHost, "*.azure-automation.net") ||
        shExpMatch(lowerHost, "*.backup.windowsazure.com") ||
        shExpMatch(lowerHost, "*.grafana.azure.com") ||
        shExpMatch(lowerHost, "*.monitor.azure.com") ||
        shExpMatch(lowerHost, "*.ods.opinsights.azure.com") ||
        shExpMatch(lowerHost, "*.oms.opinsights.azure.com") ||
        shExpMatch(lowerHost, "*.prod.migration.windowsazure.com") ||
        shExpMatch(lowerHost, "*.prometheus.monitor.azure.com") ||
        shExpMatch(lowerHost, "*.purview.azure.com") ||
        shExpMatch(lowerHost, "*.purview-service.microsoft.com") ||
        shExpMatch(lowerHost, "*.purviewstudio.azure.com") ||
        shExpMatch(lowerHost, "*.siterecovery.windowsazure.com") ||

        // ---- 4.12 Hybrid + Multicloud (3 rules) ----
        // Azure Arc / Guest Configuration / Kubernetes Configuration
        shExpMatch(lowerHost, "*.dp.kubernetesconfiguration.azure.com") ||
        shExpMatch(lowerHost, "*.guestconfiguration.azure.com") ||
        shExpMatch(lowerHost, "*.his.arc.azure.com") ||

        // ---- 4.13 Web (6 rules) ----
        // Cognitive Search / App Service & Functions / SignalR / Static Web Apps / Web PubSub
        shExpMatch(lowerHost, "*.azurestaticapps.net") ||
        shExpMatch(lowerHost, "*.azurewebsites.net") ||
        shExpMatch(lowerHost, "*.scm.azurewebsites.net") ||
        shExpMatch(lowerHost, "*.search.windows.net") ||
        shExpMatch(lowerHost, "*.service.signalr.net") ||
        shExpMatch(lowerHost, "*.webpubsub.azure.com")

    ) {
        return "DIRECT";
    }

    // ========================================================================
    // 第 5 步：預設路由 - 其餘流量送往企業 Proxy
    // ========================================================================
    // 目前設定：強制走 Proxy，Proxy 不可用時連線失敗
    return "PROXY 10.0.0.5:8000";

    // 替代方案（取消註解即可切換）：
    // --- Proxy + Failover 直連 ---
    // return "PROXY 10.0.0.5:8000; DIRECT";
    //
    // --- 雙 Proxy + Failover 直連 ---
    // return "PROXY 10.0.0.5:8000; PROXY 10.0.0.6:8000; DIRECT";
    //
    // --- HTTP Proxy + SOCKS5 Proxy + Failover 直連 ---
    // return "PROXY 10.0.0.5:8000; SOCKS5 10.0.0.7:1080; DIRECT";
}

