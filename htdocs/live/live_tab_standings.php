<div id="pane-standings" style="display:none;">
    <div class="card" style="padding:20px;">
        <div class="card-title" style="font-size:1.3rem;margin-bottom:12px;"><?php echo $labels['standings_h']; ?></div>
        <div style="overflow-x:auto;">
            <table class="standings-table">
                <thead>
                    <tr><th><?php echo $labels['pos']; ?></th><th><?php echo $labels['driver']; ?></th><th><?php echo $labels['cl']; ?></th><th><?php echo $labels['car']; ?></th><th><?php echo $labels['last_lap']; ?></th><th><?php echo $labels['best_lap']; ?></th><th><?php echo $labels['gap']; ?></th><th title="Δ">Δ</th><th style="text-align:center;">S1</th><th style="text-align:center;">S2</th><th style="text-align:center;">S3</th></tr>
                </thead>
                <tbody id="standings-body"></tbody>
            </table>
        </div>
    </div>
</div>
