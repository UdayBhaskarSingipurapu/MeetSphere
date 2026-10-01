package meetsphere.backend;

import io.github.cdimascio.dotenv.Dotenv;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BackendApplication {

	public static void main(String[] args) {
		System.out.println("Working directory = " + System.getProperty("user.dir"));
		System.out.println("JVM TimeZone = " + java.util.TimeZone.getDefault().getID());
		Dotenv dotenv = Dotenv.configure()
				.directory(".")
				.ignoreIfMissing()      // don't crash prod envs that use real env vars instead
				.load();

		dotenv.entries().forEach(e -> {
			System.setProperty(e.getKey(), e.getValue());
//			System.out.println(e.getKey() + ": " + e.getValue());
		});
		var ctx = SpringApplication.run(BackendApplication.class, args);
		System.out.println("DEBUG >> resolved datasource username = ["
				+ ctx.getEnvironment().getProperty("spring.datasource.username") + "]");
	}

}
